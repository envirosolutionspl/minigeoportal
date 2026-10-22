import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import type { CapabilitiesCache } from '../src/services/meta.ts';

// Upstream hosts resolve to a public address unless a test says otherwise.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
import { lookup } from 'node:dns/promises';
beforeEach(() => vi.mocked(lookup).mockResolvedValue([{ address: '203.0.113.10', family: 4 }] as never));

const CACHE: CapabilitiesCache = { generatedAt: '2026-10-21T00:00:00.000Z', services: {} };
const local = { incoming: { socket: { remoteAddress: '127.0.0.1', remoteFamily: 'IPv4', remotePort: 1 } } };
const remote = { incoming: { socket: { remoteAddress: '203.0.113.5', remoteFamily: 'IPv4', remotePort: 1 } } };

let dir: string;
let app: Hono;
let refresh: ReturnType<typeof vi.fn<() => Promise<CapabilitiesCache>>>;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'app-'));
  process.env.DICT_CACHE_DIR = dir;
  const { createApp } = await import('./app.ts');
  refresh = vi.fn<() => Promise<CapabilitiesCache>>(async () => ({ ...CACHE, generatedAt: 'refreshed' }));
  app = createApp({ cache: CACHE, refresh, limits: { dict: [2, 60], featureInfo: [40, 60] } });
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('routes', () => {
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

  it('refreshes only from loopback with the custom header', async () => {
    expect((await app.request('/api/capabilities/refresh', { method: 'POST' }, local)).status).toBe(403);
    expect((await app.request('/api/capabilities/refresh', { method: 'POST', headers: { 'x-refresh': 'capabilities' } }, remote)).status).toBe(403);
    const ok = await app.request('/api/capabilities/refresh', { method: 'POST', headers: { 'x-refresh': 'capabilities' } }, local);
    expect(ok.status).toBe(200);
    expect(refresh).toHaveBeenCalledOnce();
    expect(await (await app.request('/api/health', {}, remote)).json()).toMatchObject({ capabilitiesGeneratedAt: 'refreshed' });
  });

  it('maps dictionary errors: 400 for client mistakes, 502 with a generic text for upstream failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await app.request('/api/dict/wojewodztwa', {}, client)).status);
    expect(statuses).toEqual([502, 502, 429]);
  });

  it('names units for the geocoder and validates the codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));
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
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<a>x</a>', { headers: { 'content-type': 'text/xml' } })));
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
    expect((await app.request('/api/featureinfo/kieg?QUERY_LAYERS=foo&BBOX=1,2,3,4&WIDTH=1&HEIGHT=1&I=0&J=0', {}, remote)).status).toBe(400);
  });
});

describe('catalog routes', () => {
  const CATALOG = {
    generatedAt: 'built',
    entries: [
      { id: 'msZabytki', title: 'Zabytki', path: ['NID'], modules: ['GK'], topic: 'zabytki' as const, kind: 'wms' as const, url: 'https://nid.example/wms', order: 3, status: 'ok' as const, checked: 'x', sublayers: [{ name: 'monuments', title: 'Zabytki' }] },
      { id: 'msCLC', title: 'Corine', path: [], modules: ['OS'], topic: 'srodowisko' as const, kind: 'wms' as const, url: 'https://gios.example/clc', order: 4, status: 'refused' as const, detail: 'HTTP 403', checked: 'x' },
    ],
    services: {
      'https://nid.example/wms': { url: 'https://nid.example/wms', status: 'ok' as const, checked: 'x', meta: { kind: 'wms' as const, fetchedAt: 'x', title: 'NID', infoFormats: ['text/xml'], layers: { monuments: { title: 'Zabytki', queryable: true } } } },
    },
  };
  const client = { incoming: { socket: { remoteAddress: '198.51.100.20', remoteFamily: 'IPv4', remotePort: 1 } } };

  it('answers 503 while the first catalog is being built', async () => {
    const { createApp } = await import('./app.ts');
    const building = createApp({ cache: CACHE, refresh, catalog: () => undefined });
    expect((await building.request('/api/catalog', {}, client)).status).toBe(503);
  });

  it('lists the layers without addresses and gives one layer with its metadata, revalidated by ETag', async () => {
    const { createApp } = await import('./app.ts');
    const withCatalog = createApp({ cache: CACHE, refresh, catalog: () => CATALOG });
    const list = await withCatalog.request('/api/catalog', {}, client);
    const body = (await list.json()) as { entries: Record<string, unknown>[] };
    expect(body.entries.map((e) => e.id)).toEqual(['msZabytki', 'msCLC']);
    expect(body.entries[0].url).toBeUndefined();
    expect((await withCatalog.request('/api/catalog', { headers: { 'if-none-match': list.headers.get('etag')! } }, client)).status).toBe(304);

    const one = (await (await withCatalog.request('/api/catalog/msZabytki', {}, client)).json()) as { entry: { url: string }; meta: { title: string } };
    expect(one.entry.url).toBe('https://nid.example/wms');
    expect(one.meta.title).toBe('NID');
    expect((await withCatalog.request('/api/catalog/msNope', {}, client)).status).toBe(404);
  });

  it('serves layers whose geoportal id has Polish letters', async () => {
    const { createApp } = await import('./app.ts');
    const polish = { ...CATALOG, entries: [{ ...CATALOG.entries[0], id: 'msWyłozeniaModernizacja' }] };
    const res = await createApp({ cache: CACHE, refresh, catalog: () => polish }).request(`/api/catalog/${encodeURIComponent('msWyłozeniaModernizacja')}`, {}, client);
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toMatch(/^"[ -~]+"$/);
  });

  it('queries available catalog layers through the proxy and refuses unavailable ones', async () => {
    const { createApp } = await import('./app.ts');
    const withCatalog = createApp({ cache: CACHE, refresh, catalog: () => CATALOG });
    const fetchMock = vi.fn(async (_url: string) => new Response('<a/>', { headers: { 'content-type': 'text/xml' } }));
    vi.stubGlobal('fetch', fetchMock);
    const q = 'QUERY_LAYERS=monuments&BBOX=1,2,3,4&WIDTH=10&HEIGHT=10&I=1&J=1&INFO_FORMAT=text/xml';
    expect((await withCatalog.request(`/api/featureinfo/msZabytki?${q}`, {}, client)).status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain('https://nid.example/wms?');
    expect((await withCatalog.request(`/api/featureinfo/msCLC?${q}`, {}, client)).status).toBe(400);
  });

  it('rebuilds the catalog only from the server machine with the header', async () => {
    const { createApp } = await import('./app.ts');
    const refreshCatalog = vi.fn(async () => CATALOG);
    const withCatalog = createApp({ cache: CACHE, refresh, catalog: () => CATALOG, refreshCatalog });
    expect((await withCatalog.request('/api/catalog/refresh', { method: 'POST' }, local)).status).toBe(403);
    expect((await withCatalog.request('/api/catalog/refresh', { method: 'POST', headers: { 'x-refresh': 'catalog' } }, remote)).status).toBe(403);
    const ok = await withCatalog.request('/api/catalog/refresh', { method: 'POST', headers: { 'x-refresh': 'catalog' } }, local);
    expect(await ok.json()).toEqual({ generatedAt: 'built', layers: 2 });
  });
});
