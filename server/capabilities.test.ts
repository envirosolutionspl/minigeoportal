import { describe, expect, it, vi } from 'vitest';

// Upstream hosts resolve to a public address, so the address check lets them through.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '203.0.113.10', family: 4 }]) }));
import { buildCache } from './capabilities.ts';
import type { CapabilitiesCache } from '../src/services/meta.ts';

const WMS = `<?xml version="1.0"?>
<WMS_Capabilities xmlns="http://www.opengis.net/wms">
  <Service><Title>Test WMS</Title></Service>
  <Capability>
    <Request><GetFeatureInfo><Format>text/xml</Format><Format>text/html</Format></GetFeatureInfo></Request>
    <Layer queryable="0">
      <Title>Root</Title>
      <MaxScaleDenominator>10000</MaxScaleDenominator>
      <Layer queryable="1">
        <Name>dzialki</Name><Title>Działki</Title>
        <Style><Name>default</Name><LegendURL><OnlineResource xlink:href="https://x/legend.png" xmlns:xlink="http://www.w3.org/1999/xlink"/></LegendURL></Style>
      </Layer>
      <Layer>
        <Name>numery</Name><Title>Numery</Title>
        <MaxScaleDenominator>1500</MaxScaleDenominator>
        <MinScaleDenominator>100</MinScaleDenominator>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`;

const WMTS = `<?xml version="1.0"?>
<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1">
  <ows:ServiceIdentification><ows:Title>Test WMTS</ows:Title></ows:ServiceIdentification>
  <Contents>
    <Layer><ows:Identifier>ORTOFOTOMAPA</ows:Identifier><Format>image/jpeg</Format></Layer>
    <Layer><ows:Identifier>BDOO</ows:Identifier></Layer>
    <Layer><ows:Identifier>BDOT10k</ows:Identifier></Layer>
    <Layer><ows:Identifier>HipsoCien</ows:Identifier></Layer>
    <Layer><ows:Identifier>G2_MOBILE_500</ows:Identifier></Layer>
    <Layer><ows:Identifier>MAPA TOPOGRAFICZNA</ows:Identifier></Layer>
    <TileMatrixSet>
      <ows:Identifier>EPSG:2180</ows:Identifier>
      <TileMatrix><ows:Identifier>EPSG:2180:0</ows:Identifier><ScaleDenominator>30238155.7</ScaleDenominator><TopLeftCorner>850000.0 100000.0</TopLeftCorner><TileWidth>512</TileWidth><TileHeight>512</TileHeight><MatrixWidth>1</MatrixWidth><MatrixHeight>1</MatrixHeight></TileMatrix>
      <TileMatrix><ows:Identifier>EPSG:2180:1</ows:Identifier><ScaleDenominator>15119077.9</ScaleDenominator><TopLeftCorner>850000.0 100000.0</TopLeftCorner><TileWidth>512</TileWidth><TileHeight>512</TileHeight><MatrixWidth>2</MatrixWidth><MatrixHeight>2</MatrixHeight></TileMatrix>
    </TileMatrixSet>
  </Contents>
</Capabilities>`;

function stub(answer: (url: string) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => answer(url)));
}

describe('buildCache', () => {
  it('reduces WMS and WMTS capabilities to the fields the app needs', async () => {
    stub((url) => new Response(url.includes('WMTS') ? WMTS : WMS));
    const cache = await buildCache();
    const kieg = cache.services.kieg;
    expect(kieg.kind).toBe('wms');
    if (kieg.kind !== 'wms') return;
    expect(kieg.title).toBe('Test WMS');
    expect(kieg.infoFormats).toEqual(['text/xml', 'text/html']);
    // Scale limits and queryable are inherited from the parent layer unless overridden.
    expect(kieg.layers.dzialki).toEqual({ title: 'Działki', queryable: true, maxScale: 10000, legend: 'https://x/legend.png' });
    expect(kieg.layers.numery).toEqual({ title: 'Numery', queryable: false, maxScale: 1500, minScale: 100 });
    expect(kieg.layers.Root).toBeUndefined();

    const orto = cache.services.orto;
    expect(orto.kind).toBe('wmts');
    if (orto.kind !== 'wmts') return;
    // EPSG:2180 capabilities list northing first; the app wants [easting, northing].
    expect(orto.matrixSet.origin).toEqual([100000, 850000]);
    expect(orto.matrixSet.tileSize).toBe(512);
    expect(orto.matrixSet.matrices[1]).toEqual({ id: 'EPSG:2180:1', scale: 15119077.9, width: 2, height: 2 });
  });

  it('records an error per failed service and keeps the previous good entry', async () => {
    stub((url) => (url.includes('KrajowaIntegracjaEwidencjiGruntow') ? new Response('nope', { status: 503 }) : new Response(url.includes('WMTS') ? WMTS : WMS)));
    const previous: CapabilitiesCache = {
      generatedAt: 'earlier',
      services: { kieg: { kind: 'wms', fetchedAt: 'earlier', title: 'Old KIEG', infoFormats: [], layers: {} } },
    };
    const cache = await buildCache(previous);
    expect(cache.services.kieg).toEqual(previous.services.kieg);
    expect(cache.services.kimpzp.kind).toBe('wms');

    const fresh = await buildCache();
    expect(fresh.services.kieg).toMatchObject({ kind: 'error', error: 'HTTP 503' });
  });

  it('stores the geoportal drawing order and keeps the last good one when it cannot be read', async () => {
    const config = `gpmaps: [{ id: 'modulGK', layers: [
      { layerId: 'msSUiKZP' }, { layerId: 'msMPZP' }, { layerId: 'msPlanyOgolneGmin' }, { layerId: 'msKIBDOT' }, { layerId: 'msKIEG' },
      { layerId: 'msKIUT' }, { layerId: 'msRejestrCenNieruchomosci' }, { layerId: 'msAdresyUlice' }, { layerId: 'msPRG' },
    ] }]`;
    stub((url) => new Response(url.includes('part_GeoportalKrajowy') ? config : url.includes('WMTS') ? WMTS : WMS));
    const cache = await buildCache();
    expect(cache.drawOrder).toEqual(['suikzp', 'kimpzp', 'pog', 'kibdot', 'kieg', 'kiut', 'rcn', 'kina', 'prg']);

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stub((url) => (url.includes('part_GeoportalKrajowy') ? new Response('gone', { status: 404 }) : new Response(url.includes('WMTS') ? WMTS : WMS)));
    expect((await buildCache(cache)).drawOrder).toEqual(cache.drawOrder);
    expect((await buildCache()).drawOrder).toBeUndefined();
  });

  it('treats a WMTS without the expected layer or matrix set as an error', async () => {
    stub((url) => new Response(url.includes('WMTS') ? WMTS.replace('ORTOFOTOMAPA', 'INNA') : WMS));
    const cache = await buildCache();
    expect(cache.services.orto).toMatchObject({ kind: 'error', error: 'Layer ORTOFOTOMAPA not found' });
  });
});
