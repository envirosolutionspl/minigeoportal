import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { clientConfig } from '../../server/config/client.ts';
import { loadConfig } from '../../server/config/load.ts';
import { config as defaults, initConfig } from './runtime';

/**
 * The example deployment without GUGiK (examples/osm): Web Mercator, OpenStreetMap tiles,
 * Nominatim. The app's modules read the configuration as they load, so they load anew here.
 */
const osm = clientConfig(loadConfig('examples/osm'), 'en');

beforeAll(async () => {
  vi.resetModules();
  (await import('./runtime')).initConfig(osm);
});
afterAll(() => {
  vi.resetModules();
  initConfig(defaults);
});

describe('examples/osm', () => {
  it('draws in Web Mercator on the levels of the standard tile grid', async () => {
    const { PROJECTION, RESOLUTIONS, zoomForScale } = await import('@/map/projection');
    expect(PROJECTION.getCode()).toBe('EPSG:3857');
    expect(RESOLUTIONS[0]).toBeCloseTo(156543.0339, 3);
    expect(RESOLUTIONS[19]).toBeCloseTo(0.2986, 3);
    expect(zoomForScale(1000)).toBe(19);
  });

  it('prints at the scale on the ground, not on the Mercator plane', async () => {
    const { transform } = await import('ol/proj');
    const { getDistance } = await import('ol/sphere');
    const { printExtent, serverScale } = await import('@/map/print');
    const warsaw = transform([21, 52.2], 'EPSG:4326', 'EPSG:3857');
    const sheet = { paper: 'A4', orientation: 'landscape', scale: 10000 } as const;
    // The A4 frame is 277 mm wide: 2770 m on the ground at 1:10 000, wherever the map is.
    const [minX, minY, maxX, maxY] = printExtent(warsaw, sheet);
    const across = getDistance(
      transform([minX, (minY + maxY) / 2], 'EPSG:3857', 'EPSG:4326'),
      transform([maxX, (minY + maxY) / 2], 'EPSG:3857', 'EPSG:4326'),
    );
    expect(across).toBeCloseTo(2770, -1);
    // Map servers count Mercator metres: they see a larger denominator than at the equator.
    expect(serverScale(sheet, warsaw)).toBeGreaterThan(serverScale(sheet) * 1.5);
  });

  it('reads typed coordinates as latitude and longitude, and writes the system by its name', async () => {
    const { parseCoordinates } = await import('@/search/coordinates');
    const hit = parseCoordinates('52.2318, 21.0067')!;
    expect(hit.center![0]).toBeCloseTo(2338455, 0);
    expect(hit.center![1]).toBeCloseTo(6842147, 0);
    expect(hit.label.replace(/\s/g, ' ')).toBe('Web Mercator X 2,338,455, Y 6,842,147 · 52.23180° N, 21.00670° E');
  });

  it('searches with Nominatim after Enter, without the parcel search', async () => {
    const { searchProvider } = await import('@/search');
    expect(searchProvider.instant).toBe(false);
    expect(searchProvider.placeholder).toBe('Address or place, Enter searches');
    expect(osm.search).toEqual({ provider: 'nominatim', parcel: false });
    expect(osm.modules).toEqual({});
  });

  it('builds its XYZ base map and the WMS overlay in Web Mercator', async () => {
    const { createOverlayLayer, createTileLayer } = await import('@/services/layers');
    const tiles = createTileLayer(osm.map.tileServices[0]).getSource()!;
    expect(tiles.getProjection()?.getCode()).toBe('EPSG:3857');
    expect(tiles.getTileGrid()!.getMaxZoom()).toBe(19);
    const labels = createOverlayLayer(osm.layers.overlays[0]).getSource()!;
    expect(labels.getProjection()?.getCode()).toBe('EPSG:3857');
  });
});
