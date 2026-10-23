import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
import { lookup } from 'node:dns/promises';
import { featureInfo, overlayTarget } from './featureinfo.ts';
import { defaults } from './testSite.ts';

const CRS = 'EPSG:2180';
import { RequestError } from './http.ts';

/** The configured overlays, as the app looks them up. */
const own = (id: string) => {
  const def = defaults.layers.overlays.find((o) => o.id === id);
  return def && overlayTarget(def);
};

const KIEG = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow';
const VALID = 'QUERY_LAYERS=dzialki&BBOX=482449,656835,482475,656861&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=text/xml';
const query = (q: string) => new URLSearchParams(q);

/** Every host resolves to a public address unless a test says otherwise. */
beforeEach(() => vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never));

/** fetch stub: each entry answers one hop; `calls` records the URLs in order. */
function stubHops(hops: (() => Response)[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const next = hops.shift();
      return next ? next() : new Response('no more hops', { status: 500 });
    }),
  );
  return calls;
}
const redirect = (location: string) => () => new Response(null, { status: 302, headers: { location } });
const ok =
  (body: string, type = 'text/xml') =>
  () =>
    new Response(body, { status: 200, headers: { 'content-type': type } });

describe('featureInfo validation', () => {
  it.each([
    ['evil', VALID, 'Unknown service'],
    ['kieg', VALID.replace('dzialki', 'foo'), 'Invalid QUERY_LAYERS'],
    ['kieg', VALID.replace('QUERY_LAYERS=dzialki', 'QUERY_LAYERS='), 'Invalid QUERY_LAYERS'],
    ['kieg', VALID.replace('482475,656861', '482475'), 'Invalid BBOX'],
    ['kieg', VALID.replace('WIDTH=101', 'WIDTH=99999'), 'Invalid WIDTH, HEIGHT, I or J'],
    ['kieg', VALID.replace('I=50', 'I=-1'), 'Invalid WIDTH, HEIGHT, I or J'],
    ['kieg', VALID.replace('text/xml', 'text/evil'), 'Invalid INFO_FORMAT'],
  ])('rejects %s?%s with "%s"', async (service, q, message) => {
    stubHops([]);
    await expect(featureInfo(service, query(q), own, CRS)).rejects.toThrow(new RequestError(message));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rebuilds the upstream request from validated values only', async () => {
    const calls = stubHops([ok('<x/>')]);
    await featureInfo('kieg', query(`${VALID}&FEATURE_COUNT=99999&REQUEST=GetMap&SERVICE=WFS&EXTRA=1`), own, CRS);
    const url = new URL(calls[0]);
    expect(url.origin + url.pathname).toBe(KIEG);
    expect(url.searchParams.get('REQUEST')).toBe('GetFeatureInfo');
    expect(url.searchParams.get('SERVICE')).toBe('WMS');
    expect(url.searchParams.get('CRS')).toBe('EPSG:2180');
    expect(url.searchParams.get('LAYERS')).toBe('dzialki');
    expect(url.searchParams.get('FEATURE_COUNT')).toBe('10');
    expect(url.searchParams.has('EXTRA')).toBe(false);
  });

  it('asks a catalog layer through the lookup, keeping parameters carried in its address', async () => {
    const calls = stubHops([ok('<x/>')]);
    const find = (id: string) =>
      id === 'msSiatka' ? { url: 'https://wms02.example/cgi-bin/mapserv?map=/srv/siatka92.map', layers: new Set(['dzialki']) } : undefined;
    await featureInfo('msSiatka', query(VALID), find, CRS);
    const url = new URL(calls[0]);
    expect(url.searchParams.get('map')).toBe('/srv/siatka92.map');
    expect(url.searchParams.get('REQUEST')).toBe('GetFeatureInfo');
    await expect(featureInfo('msOther', query(VALID), find, CRS)).rejects.toThrow(new RequestError('Unknown service'));
  });

  it('never contacts a catalog address in a private network', async () => {
    const calls = stubHops([ok('secret')]);
    vi.mocked(lookup).mockResolvedValue([{ address: '192.168.1.10', family: 4 }] as never);
    const find = () => ({ url: 'https://router.example/wms', layers: new Set(['dzialki']) });
    await expect(featureInfo('msRouter', query(VALID), find, CRS)).rejects.toThrow('Address not allowed');
    expect(calls).toHaveLength(0);
  });
});

describe('featureInfo redirects', () => {
  it('follows redirects to public hosts and returns the final body and type', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const calls = stubHops([
      redirect('https://integracja01.gugik.gov.pl/cgi-bin/x?a=1'),
      redirect('https://powiat-otwocki.geoportal2.pl/map/wmse.php?b=2'),
      ok('<?xml version="1.0"?><F/>', 'text/xml; charset=utf-8'),
    ]);
    const result = await featureInfo('kieg', query(VALID), own, CRS);
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain('powiat-otwocki.geoportal2.pl');
    expect(result).toEqual({ contentType: 'text/xml', body: '<?xml version="1.0"?><F/>' });
  });

  it('stops at a redirect to a private address', async () => {
    vi.mocked(lookup).mockImplementation((async (host: string) =>
      host === 'internal.example' ? [{ address: '10.0.0.5', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]) as never);
    const calls = stubHops([redirect('https://internal.example/admin'), ok('secret')]);
    await expect(featureInfo('kieg', query(VALID), own, CRS)).rejects.toThrow(/Redirect chain rejected/);
    expect(calls).toHaveLength(1);
  });

  it.each(['ftp://x.example/', 'https://x.example:8000/', 'file:///etc/passwd'])('stops at %s', async (location) => {
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const calls = stubHops([redirect(location), ok('x')]);
    await expect(featureInfo('kieg', query(VALID), own, CRS)).rejects.toThrow(/Redirect chain rejected/);
    expect(calls).toHaveLength(1);
  });

  it('gives up after too many redirects', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const calls = stubHops(Array.from({ length: 8 }, (_, i) => redirect(`https://h${i}.example/`)));
    await expect(featureInfo('kieg', query(VALID), own, CRS)).rejects.toThrow(/Too many redirects/);
    expect(calls).toHaveLength(6);
  });

  it('reports upstream errors without exposing the body', async () => {
    stubHops([() => new Response('internal details', { status: 500 })]);
    await expect(featureInfo('kieg', query(VALID), own, CRS)).rejects.toThrow('Upstream HTTP 500');
  });

  it('ends the upstream request when the client goes away', async () => {
    let seen: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init.signal ?? undefined;
        return new Response('<a/>', { headers: { 'content-type': 'text/xml' } });
      }),
    );
    const client = new AbortController();
    await featureInfo('kieg', query(VALID), own, CRS, client.signal);
    expect(seen?.aborted).toBe(false);
    client.abort();
    expect(seen?.aborted).toBe(true);
  });

  it('decodes the declared charset and falls back to utf-8 for an unknown one', async () => {
    const latin2 = new Uint8Array([0xb3, 0xb1]); // "łą" in ISO-8859-2
    stubHops([() => new Response(latin2, { headers: { 'content-type': 'text/html; charset=ISO-8859-2' } })]);
    expect((await featureInfo('kieg', query(VALID), own, CRS)).body).toBe('łą');
    stubHops([() => new Response('plain', { headers: { 'content-type': 'text/html; charset=x-unknown' } })]);
    expect((await featureInfo('kieg', query(VALID), own, CRS)).body).toBe('plain');
  });
});

describe('WMTS and ArcGIS queries', () => {
  const WMTS = {
    kind: 'wmts' as const,
    url: 'https://mapy.geoportal.gov.pl/wss/service/WMTS/guest/wmts/TOPO',
    layers: new Set(['MAPA TOPOGRAFICZNA']),
    wmts: {
      layer: 'MAPA TOPOGRAFICZNA',
      style: 'default',
      format: 'image/jpeg',
      matrixSet: 'EPSG:2180',
      matrices: new Set(['EPSG:2180:9']),
      tileSize: 512,
      infoFormats: new Set(['text/html']),
    },
  };
  const REST = {
    kind: 'rest' as const,
    url: 'https://mapy.geoportal.gov.pl/gprest/services/MapaGlebowoRolnicza/MapServer/',
    layers: new Set(['0', '2']),
  };
  const lookup = (id: string) => (id === 'msTopo' ? WMTS : id === 'msGleby' ? REST : undefined);
  const TILE = 'TILEMATRIX=EPSG:2180:9&TILEROW=120&TILECOL=88&I=10&J=511&INFOFORMAT=text/html';

  it('asks a WMTS about one pixel of one tile of its own grid', async () => {
    const calls = stubHops([ok('<html></html>', 'text/html')]);
    await featureInfo('msTopo', query(TILE), lookup, CRS);
    const url = new URL(calls[0]);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      SERVICE: 'WMTS',
      REQUEST: 'GetFeatureInfo',
      VERSION: '1.0.0',
      LAYER: 'MAPA TOPOGRAFICZNA',
      STYLE: 'default',
      FORMAT: 'image/jpeg',
      TILEMATRIXSET: 'EPSG:2180',
      TILEMATRIX: 'EPSG:2180:9',
      TILEROW: '120',
      TILECOL: '88',
      I: '10',
      J: '511',
      INFOFORMAT: 'text/html',
    });
  });

  it.each([
    [TILE.replace('EPSG:2180:9', 'EPSG:2180:99'), 'Invalid TILEMATRIX'],
    [TILE.replace('J=511', 'J=512'), 'Invalid TILEROW, TILECOL, I or J'],
    [TILE.replace('TILEROW=120', 'TILEROW=x'), 'Invalid TILEROW, TILECOL, I or J'],
    [TILE.replace('text/html', 'text/evil'), 'Invalid INFOFORMAT'],
  ])('rejects a WMTS query %s with "%s"', async (q, message) => {
    await expect(featureInfo('msTopo', query(q), lookup, CRS)).rejects.toThrow(message);
  });

  it('asks an ArcGIS service to identify the clicked point in its queryable layers', async () => {
    const calls = stubHops([ok('{"results":[]}', 'application/json')]);
    await featureInfo('msGleby', query('QUERY_LAYERS=2,0&BBOX=559950,419950,560050,420050&WIDTH=100&HEIGHT=100&I=50&J=50'), lookup, CRS);
    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/gprest/services/MapaGlebowoRolnicza/MapServer/identify');
    // Full precision: a geographic map would lose up to a kilometre at two decimals.
    expect(url.searchParams.get('geometry')).toBe('560000,420000');
    expect(url.searchParams.get('layers')).toBe('visible:2,0');
    expect(url.searchParams.get('sr')).toBe('2180');
    expect(url.searchParams.get('imageDisplay')).toBe('100,100,96');
    await expect(featureInfo('msGleby', query('QUERY_LAYERS=1&BBOX=0,0,1,1&WIDTH=1&HEIGHT=1&I=0&J=0'), lookup, CRS)).rejects.toThrow(
      'Invalid QUERY_LAYERS',
    );
  });
});
