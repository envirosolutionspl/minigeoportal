import { describe, expect, it } from 'vitest';
import type WMTSTileGrid from 'ol/tilegrid/WMTS';
import WMTS from 'ol/source/WMTS';
import XYZ from 'ol/source/XYZ';
import ImageWMS from 'ol/source/ImageWMS';
import ImageArcGISRest from 'ol/source/ImageArcGISRest';
import { EPSG2180, GUGIK_RESOLUTIONS, OGC_PIXEL } from '@/map/projection';
import { OVERLAYS, OVERLAY_BY_ID, TILE_SERVICE_BY_ID } from './registry';
import { DRAW_ORDER, createOverlayLayer, createTileLayer, resolutionRange, showSublayers } from './layers';
import { registerMeta } from './meta';
import { CAPABILITIES, withCapabilities } from '@/test/helpers';

describe('createTileLayer', () => {
  it('uses the shared GUGiK grid without a cache and the cached matrices with it', async () => {
    const bdot = TILE_SERVICE_BY_ID.get('bdot10k')!;
    const fallback = createTileLayer(bdot).getSource()!.getTileGrid() as WMTSTileGrid;
    expect(fallback.getResolutions()).toEqual(GUGIK_RESOLUTIONS.slice(2, 15));
    expect(fallback.getMatrixIds()[0]).toBe('EPSG:2180:0');

    await withCapabilities();
    const grid = createTileLayer(TILE_SERVICE_BY_ID.get('orto')!).getSource()!.getTileGrid()!;
    expect(grid.getResolutions()).toHaveLength(3);
    expect(grid.getResolution(1)).toBeCloseTo(15119077.8571 * OGC_PIXEL, 3);
    // Matrix sizes limit which tiles the map asks for: one tile at level 0.
    expect(grid.getFullTileRange(0)!.getWidth()).toBe(1);
  });

  it('draws only in the given resolution range', () => {
    const layer = createTileLayer(TILE_SERVICE_BY_ID.get('bdoo')!, { minResolution: 70000 * OGC_PIXEL });
    expect(layer.getMinResolution()).toBeCloseTo(19.6, 1);
    expect(layer.getMaxResolution()).toBe(Infinity);
  });
});

describe('createOverlayLayer', () => {
  it('asks for one transparent PNG per view in EPSG:2180', () => {
    const kieg = createOverlayLayer(OVERLAY_BY_ID.get('kieg')!);
    expect((kieg.getSource() as ImageWMS).getParams()).toMatchObject({ FORMAT: 'image/png', TRANSPARENT: true, VERSION: '1.3.0' });
    expect(kieg.getOpacity()).toBe(1);
    expect(createOverlayLayer(OVERLAY_BY_ID.get('kimpzp')!).getOpacity()).toBe(0.8);
    showSublayers(kieg, ['dzialki', 'budynki']);
    expect((kieg.getSource() as ImageWMS).getParams().LAYERS).toBe('dzialki,budynki');
  });

  it('draws a catalog WMTS and ArcGIS tile cache as tiles, and an ArcGIS map as images of the chosen layers', () => {
    const base = OVERLAY_BY_ID.get('kieg')!;
    registerMeta('msTopo', {
      kind: 'wmts',
      fetchedAt: 'x',
      title: 'Topo',
      layer: 'MAPA TOPOGRAFICZNA',
      format: 'image/jpeg',
      style: 'default',
      matrixSet: {
        id: 'EPSG:2180',
        origin: [100000, 850000],
        tileSize: 512,
        matrices: [{ id: 'EPSG:2180:0', scale: 30238155.7, width: 1, height: 1 }],
      },
    });
    const topo = createOverlayLayer({
      ...base,
      id: 'msTopo',
      kind: 'wmts',
      url: 'https://gugik.example/wmts',
      sublayers: [],
    }).getSource() as WMTS;
    expect(topo).toBeInstanceOf(WMTS);
    expect([topo.getLayer(), topo.getMatrixSet(), topo.getFormat()]).toEqual(['MAPA TOPOGRAFICZNA', 'EPSG:2180', 'image/jpeg']);

    registerMeta('msCache', {
      kind: 'rest',
      fetchedAt: 'x',
      title: 'Cache',
      layers: {},
      tiles: { origin: [100000, 850000], tileSize: 512, resolutions: [100, 50] },
    });
    const cache = createOverlayLayer({
      ...base,
      id: 'msCache',
      kind: 'rest',
      url: 'https://gugik.example/MapServer/',
      sublayers: [],
    }).getSource() as XYZ;
    expect(cache.getTileUrlFunction()([1, 2, 3], 1, EPSG2180)).toBe('https://gugik.example/MapServer/tile/1/3/2');

    registerMeta('msGleby', { kind: 'rest', fetchedAt: 'x', title: 'Gleby', layers: { '2': { title: 'Kontury', queryable: false } } });
    const gleby = createOverlayLayer({ ...base, id: 'msGleby', kind: 'rest', url: 'https://gugik.example/gleby/MapServer', sublayers: [] });
    showSublayers(gleby, ['2', '0']);
    expect(gleby.getSource()).toBeInstanceOf(ImageArcGISRest);
    expect((gleby.getSource() as ImageArcGISRest).getParams().LAYERS).toBe('show:2,0');
  });
});

describe('drawing order', () => {
  it('follows geoportal.gov.pl: plans lowest, then networks, parcels over them, prices on top', () => {
    const z = (id: string) => createOverlayLayer(OVERLAY_BY_ID.get(id)!).getZIndex()!;
    expect(z('kimpzp')).toBeLessThan(z('pog'));
    expect(z('pog')).toBeLessThan(z('kiut'));
    expect(z('kiut')).toBeLessThan(z('kieg'));
    expect(z('kieg')).toBeLessThan(z('rcn'));
  });

  it('uses the order the server read from geoportal.gov.pl when there is one', async () => {
    await withCapabilities({ ...CAPABILITIES, drawOrder: ['rcn', 'kieg', 'kiut', 'pog', 'kimpzp'] });
    const z = (id: string) => createOverlayLayer(OVERLAY_BY_ID.get(id)!).getZIndex()!;
    expect(z('rcn')).toBeLessThan(z('kieg'));
    expect(z('pog')).toBeLessThan(z('kimpzp'));
    await withCapabilities();
  });

  it('lists every overlay of the registry once', () => {
    expect([...DRAW_ORDER].sort()).toEqual(OVERLAYS.map((o) => o.id).sort());
  });
});

describe('resolutionRange', () => {
  it('spans the widest visible range of the selected sublayers', async () => {
    await withCapabilities();
    const kieg = OVERLAY_BY_ID.get('kieg')!;
    const range = resolutionRange(kieg, ['obreby', 'dzialki']);
    expect(range.min).toBe(0);
    expect(range.max).toBeCloseTo(25000 * OGC_PIXEL, 6);
    expect(resolutionRange(kieg, ['obreby'])).toEqual({ min: 10000 * OGC_PIXEL, max: 25000 * OGC_PIXEL });
    expect(resolutionRange(kieg, ['unknown'])).toEqual({ min: 0, max: Infinity });
  });
});
