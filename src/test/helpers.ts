import { vi } from 'vitest';
import Map from 'ol/Map';
import View from 'ol/View';
import { PROJECTION } from '@/map/projection';
import type { CapabilitiesCache } from '@/services/meta';
import { clearCapabilities, loadCapabilities } from '@/services/meta';

/**
 * A map in jsdom: in the page, without controls or interactions, of a fixed size, rendered once,
 * and laid out from the window's top left corner (jsdom lays nothing out) so pixels and
 * coordinates answer each other. `detach` takes it out of the page again.
 */
export function testMap({
  center = [600000, 500000],
  resolution = 10,
  zoom,
  size = [800, 600],
}: { center?: [number, number]; resolution?: number; zoom?: number; size?: [number, number] } = {}) {
  const target = document.createElement('div');
  document.body.append(target);
  const map = new Map({
    target,
    view: new View({ projection: PROJECTION, center, ...(zoom === undefined ? { resolution } : { zoom }) }),
    controls: [],
    interactions: [],
  });
  map.setSize(size);
  map.renderSync();
  const viewport = map.getViewport() as HTMLElement;
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, size[0], size[1]));
  const detach = () => {
    map.setTarget(undefined);
    target.remove();
  };
  return { map, viewport, detach };
}

/** A fetch stub that answers by URL substring; unknown URLs get 404. */
export type Route = [match: string | RegExp, body: string | object, init?: ResponseInit];

export function stubFetch(routes: Route[]) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const route = routes.find(([m]) => (typeof m === 'string' ? url.includes(m) : m.test(url)));
    if (!route) return new Response('not found', { status: 404 });
    const [, body, init] = route;
    return typeof body === 'string'
      ? new Response(body, init)
      : new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

/** Minimal capabilities cache for the services the tests touch. */
export const CAPABILITIES: CapabilitiesCache = {
  generatedAt: '2026-10-21T00:00:00.000Z',
  services: {
    kieg: {
      kind: 'wms',
      fetchedAt: '2026-10-21T00:00:00.000Z',
      title: 'KIEG',
      infoFormats: ['text/xml', 'text/html'],
      layers: {
        obreby: { title: 'Obręby', queryable: true, minScale: 10000, maxScale: 25000 },
        dzialki: { title: 'Działki', queryable: true, maxScale: 10000 },
        budynki: { title: 'Budynki', queryable: false, maxScale: 2500 },
        numery_dzialek: { title: 'Numery', queryable: false, maxScale: 1500 },
      },
    },
    kimpzp: {
      kind: 'wms',
      fetchedAt: '2026-10-21T00:00:00.000Z',
      title: 'KIMPZP',
      infoFormats: ['text/html', 'application/vnd.ogc.gml'],
      layers: { 'wektor-str': { title: 'Strefy', queryable: true, maxScale: 10000 } },
    },
    kiut: { kind: 'error', fetchedAt: '2026-10-21T00:00:00.000Z', error: 'HTTP 403' },
    rcn: { kind: 'error', fetchedAt: '2026-10-21T00:00:00.000Z', error: 'fetch failed' },
    orto: {
      kind: 'wmts',
      fetchedAt: '2026-10-21T00:00:00.000Z',
      title: 'ORTO',
      matrixSet: {
        id: 'EPSG:2180',
        origin: [100000, 850000],
        tileSize: 512,
        matrices: [
          { id: 'EPSG:2180:0', scale: 30238155.7143, width: 1, height: 1 },
          { id: 'EPSG:2180:1', scale: 15119077.8571, width: 1, height: 1 },
          { id: 'EPSG:2180:2', scale: 7559538.9286, width: 1, height: 1 },
        ],
      },
    },
  },
};

/** Loads the test capabilities into the app's metadata module. */
export async function withCapabilities(cache: CapabilitiesCache = CAPABILITIES): Promise<void> {
  clearCapabilities();
  stubFetch([['/api/capabilities', cache]]);
  await loadCapabilities();
}
