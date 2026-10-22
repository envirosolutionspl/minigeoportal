import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { site } from './testSite.ts';
import { createSite } from './html.ts';

// Upstream hosts resolve to a public address unless a test says otherwise.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
import { lookup } from 'node:dns/promises';
beforeEach(() => vi.mocked(lookup).mockResolvedValue([{ address: '203.0.113.10', family: 4 }] as never));

const CACHE: CapabilitiesCache = { generatedAt: '2026-10-21T00:00:00.000Z', services: {} };
const local = { incoming: { socket: { remoteAddress: '127.0.0.1', remoteFamily: 'IPv4', remotePort: 1 } } };
const remote = { incoming: { socket: { remoteAddress: '203.0.113.5', remoteFamily: 'IPv4', remotePort: 1 } } };

let dir: string;
let app: Hono;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'app-'));
  process.env.DICT_CACHE_DIR = dir;
  const { createApp } = await import('./app.ts');
  app = createApp({ site, cache: () => CACHE, limits: { dict: [2, 60], featureInfo: [40, 60] } });
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('routes', () => {
  it('leaves out the gugik routes, and its search hosts in the CSP, without the module', async () => {
    const { createApp } = await import('./app.ts');
    const plain = createSite({
      ...site.config,
      app: { ...site.config.app, modules: {}, search: { ...site.config.app.search, provider: 'none', parcel: false } },
    });
    const bare = createApp({ site: plain, cache: () => CACHE, catalog: () => undefined });
    for (const path of ['/api/catalog', '/api/dict/wojewodztwa', '/api/orto?x=1&y=1']) {
      expect((await bare.request(path, {}, remote)).status).toBe(404);
    }
    const csp = (await bare.request('/api/health', {}, remote)).headers.get('content-security-policy')!;
    expect(csp).toContain("connect-src 'self';");
  });

  it('searches OpenStreetMap places through Nominatim only when configured to', async () => {
    const { createApp } = await import('./app.ts');
    const osm = createSite({ ...site.config, app: { ...site.config.app, search: { ...site.config.app.search, provider: 'nominatim' } } });
    const row = {
      display_name: 'Kraków, Polska',
      lat: '50.06',
      lon: '19.94',
      boundingbox: ['49.97', '50.13', '19.79', '20.22'],
      type: 'city',
    };
    const fetch = vi.fn(async () => new Response(JSON.stringify([row])));
    vi.stubGlobal('fetch', fetch);
    const res = await createApp({ site: osm, cache: () => CACHE }).request('/api/search?q=Krak%C3%B3w&lang=pl', {}, remote);
    expect(await res.json()).toEqual([
      { label: 'Kraków, Polska', point: [19.94, 50.06], bbox: [19.79, 49.97, 20.22, 50.13], type: 'city' },
    ]);
    expect(String(fetch.mock.calls[0]).startsWith('https://nominatim.openstreetmap.org/search?')).toBe(true);
    expect((await app.request('/api/search?q=Krak%C3%B3w', {}, remote)).status).toBe(404);
  });

  it('serves the configuration for the page, revalidated', async () => {
    const res = await app.request('/api/config', {}, remote);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    const body = (await res.json()) as typeof site.defaults;
    expect(body).toEqual(site.defaults);
    const again = await app.request('/api/config', { headers: { 'if-none-match': res.headers.get('etag')! } }, remote);
    expect(again.status).toBe(304);
  });

  it('serves health and capabilities with security headers', async () => {
    const res = await app.request('/api/health', {}, remote);
    expect(await res.json()).toEqual({ ok: true, capabilitiesGeneratedAt: CACHE.generatedAt });
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const caps = await app.request('/api/capabilities', {}, remote);
    // Revalidated every time, so a refresh reaches the app at once; unchanged costs a 304.
    expect(caps.headers.get('cache-control')).toBe('no-cache');
    const etag = caps.headers.get('etag')!;
    expect(etag).toBe(`"${CACHE.generatedAt}"`);
    const again = await app.request('/api/capabilities', { headers: { 'if-none-match': etag } }, remote);
    expect(again.status).toBe(304);
  });

  it('answers 404 for unknown API paths', async () => {
    expect((await app.request('/api/nope', {}, remote)).status).toBe(404);
    expect((await app.request('/api/health', { method: 'DELETE' }, remote)).status).toBe(404);
  });

  it('serves the metadata as last read, so an update reaches the app without a restart', async () => {
    const { createApp } = await import('./app.ts');
    let current = CACHE;
    const following = createApp({ site, cache: () => current });
    current = { ...CACHE, generatedAt: 'updated' };
    expect(await (await following.request('/api/health', {}, remote)).json()).toMatchObject({ capabilitiesGeneratedAt: 'updated' });
    expect((await following.request('/api/capabilities/refresh', { method: 'POST' }, local)).status).toBe(404);
  });

  it('maps dictionary errors: 400 for client mistakes, 502 with a generic text for upstream failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 503 })),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const invalid = await app.request('/api/dict/powiaty/xx', {}, remote);
    expect(invalid.status).toBe(400);
    const down = await app.request('/api/dict/wojewodztwa', {}, remote);
    expect(down.status).toBe(502);
    expect(await down.text()).not.toContain('boom');
    expect(warn).toHaveBeenCalled();
  });

  it('rate limits the dictionaries per client', async () => {
    const client = { incoming: { socket: { remoteAddress: '198.51.100.7', remoteFamily: 'IPv4', remotePort: 1 } } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 503 })),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await app.request('/api/dict/wojewodztwa', {}, client)).status);
    expect(statuses).toEqual([502, 502, 429]);
  });

  it('names units for the geocoder and validates the codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 503 })),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = { incoming: { socket: { remoteAddress: '198.51.100.8', remoteFamily: 'IPv4', remotePort: 1 } } };
    expect((await app.request('/api/dict/jednostki?teryt=abc', {}, client)).status).toBe(400);
    expect((await app.request('/api/dict/jednostki?teryt=141708', {}, client)).status).toBe(502);
  });

  it('searches units by name, answering short queries without asking upstream', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = { incoming: { socket: { remoteAddress: '198.51.100.9', remoteFamily: 'IPv4', remotePort: 1 } } };
    const short = await app.request('/api/dict/szukaj?q=w', {}, client);
    expect(await short.json()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await app.request('/api/dict/szukaj?q=otwock', {}, client)).status).toBe(502);
  });

  it('answers 400 for an orthophoto query outside Poland', async () => {
    const client = { incoming: { socket: { remoteAddress: '198.51.100.10', remoteFamily: 'IPv4', remotePort: 1 } } };
    expect((await app.request('/api/orto?x=1&y=2', {}, client)).status).toBe(400);
  });

  it('returns feature info as plain text with the upstream type in a header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<a>x</a>', { headers: { 'content-type': 'text/xml' } })),
    );
    const res = await app.request(
      '/api/featureinfo/kieg?QUERY_LAYERS=dzialki&BBOX=1,2,3,4&WIDTH=10&HEIGHT=10&I=1&J=1&INFO_FORMAT=text/xml',
      {},
      remote,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('x-upstream-content-type')).toBe('text/xml');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('<a>x</a>');
    expect((await app.request('/api/featureinfo/kieg?QUERY_LAYERS=foo&BBOX=1,2,3,4&WIDTH=1&HEIGHT=1&I=0&J=0', {}, remote)).status).toBe(
      400,
    );
  });
});

describe('catalog routes', () => {
  const CATALOG = {
    generatedAt: 'built',
    entries: [
      {
        id: 'msZabytki',
        title: 'Zabytki',
        path: ['NID'],
        modules: ['GK'],
        topic: 'zabytki' as const,
        kind: 'wms' as const,
        url: 'https://nid.example/wms',
        order: 3,
        status: 'ok' as const,
        checked: 'x',
        sublayers: [{ name: 'monuments', title: 'Zabytki' }],
      },
      {
        id: 'msCLC',
        title: 'Corine',
        path: [],
        modules: ['OS'],
        topic: 'srodowisko' as const,
        kind: 'wms' as const,
        url: 'https://gios.example/clc',
        order: 4,
        status: 'refused' as const,
        detail: 'HTTP 403',
        checked: 'x',
      },
    ],
    services: {
      'https://nid.example/wms': {
        url: 'https://nid.example/wms',
        status: 'ok' as const,
        checked: 'x',
        meta: {
          kind: 'wms' as const,
          fetchedAt: 'x',
          title: 'NID',
          infoFormats: ['text/xml'],
          layers: { monuments: { title: 'Zabytki', queryable: true } },
        },
      },
    },
  };
  const client = { incoming: { socket: { remoteAddress: '198.51.100.20', remoteFamily: 'IPv4', remotePort: 1 } } };

  it('answers 503 while the first catalog is being built', async () => {
    const { createApp } = await import('./app.ts');
    const building = createApp({ site, cache: () => CACHE, catalog: () => undefined });
    expect((await building.request('/api/catalog', {}, client)).status).toBe(503);
  });

  it('lists the layers without addresses and gives one layer with its metadata, revalidated by ETag', async () => {
    const { createApp } = await import('./app.ts');
    const withCatalog = createApp({ site, cache: () => CACHE, catalog: () => CATALOG });
    const list = await withCatalog.request('/api/catalog', {}, client);
    const body = (await list.json()) as { entries: Record<string, unknown>[] };
    expect(body.entries.map((e) => e.id)).toEqual(['msZabytki', 'msCLC']);
    expect(body.entries[0].url).toBeUndefined();
    expect((await withCatalog.request('/api/catalog', { headers: { 'if-none-match': list.headers.get('etag')! } }, client)).status).toBe(
      304,
    );

    const one = (await (await withCatalog.request('/api/catalog/msZabytki', {}, client)).json()) as {
      entry: { url: string };
      meta: { title: string };
    };
    expect(one.entry.url).toBe('https://nid.example/wms');
    expect(one.meta.title).toBe('NID');
    expect((await withCatalog.request('/api/catalog/msNope', {}, client)).status).toBe(404);
  });

  it('serves layers whose geoportal id has Polish letters', async () => {
    const { createApp } = await import('./app.ts');
    const polish = { ...CATALOG, entries: [{ ...CATALOG.entries[0], id: 'msWyłozeniaModernizacja' }] };
    const res = await createApp({ site, cache: () => CACHE, catalog: () => polish }).request(
      `/api/catalog/${encodeURIComponent('msWyłozeniaModernizacja')}`,
      {},
      client,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toMatch(/^"[ -~]+"$/);
  });

  it('queries available catalog layers through the proxy and refuses unavailable ones', async () => {
    const { createApp } = await import('./app.ts');
    const withCatalog = createApp({ site, cache: () => CACHE, catalog: () => CATALOG });
    const fetchMock = vi.fn(async (_url: string) => new Response('<a/>', { headers: { 'content-type': 'text/xml' } }));
    vi.stubGlobal('fetch', fetchMock);
    const q = 'QUERY_LAYERS=monuments&BBOX=1,2,3,4&WIDTH=10&HEIGHT=10&I=1&J=1&INFO_FORMAT=text/xml';
    expect((await withCatalog.request(`/api/featureinfo/msZabytki?${q}`, {}, client)).status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain('https://nid.example/wms?');
    expect((await withCatalog.request(`/api/featureinfo/msCLC?${q}`, {}, client)).status).toBe(400);
  });
});
