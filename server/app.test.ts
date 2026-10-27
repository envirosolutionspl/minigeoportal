import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { MESSAGE } from '../shared/report.ts';
import type { Mailer } from './report.ts';
import { client, site } from './testSite.ts';
import { createSite } from './html.ts';

// Upstream hosts resolve to a public address unless a test says otherwise.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
import { lookup } from 'node:dns/promises';
beforeEach(() => vi.mocked(lookup).mockResolvedValue([{ address: '203.0.113.10', family: 4 }] as never));

const CACHE: CapabilitiesCache = { generatedAt: '2026-10-21T00:00:00.000Z', services: {} };
const remote = client();

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
  it('serves the brand images of the configuration, cached for good at their versioned address', async () => {
    const logo = site.config.brand.logo!;
    const res = await app.request(`/brand/logo.svg?v=${logo.version}`, {}, remote);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(await res.text()).toBe(new TextDecoder().decode(logo.body));
    // An old address gets the current file, but asks again next time.
    expect((await app.request('/brand/logo.svg?v=old', {}, remote)).headers.get('cache-control')).toBe('no-cache');
    expect((await app.request('/brand/icon.svg', {}, remote)).status).toBe(404);
    // An SVG of tens of kilobytes goes out compressed.
    const packed = await app.request(`/brand/logo.svg?v=${logo.version}`, { headers: { 'accept-encoding': 'gzip' } }, remote);
    expect(packed.headers.get('content-encoding')).toBe('gzip');
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
    // How a place is read is nominatim.test.ts's; here only that the route reaches the configured server.
    expect(await res.json()).toHaveLength(1);
    expect(String(fetch.mock.calls[0]).startsWith('https://nominatim.openstreetmap.org/search?')).toBe(true);
    expect((await app.request('/api/search?q=Krak%C3%B3w', {}, remote)).status).toBe(404);
  });

  it('runs the example deployment without GUGiK: none of its routes, Nominatim search, no outside hosts', async () => {
    const { createApp } = await import('./app.ts');
    const { loadConfig } = await import('./config/load.ts');
    const osm = createApp({ site: createSite(loadConfig('examples/osm')), cache: () => CACHE });
    for (const path of ['/api/catalog', '/api/dict/wojewodztwa', '/api/orto?x=1&y=1']) {
      expect((await osm.request(path, {}, remote)).status).toBe(404);
    }
    expect(await (await osm.request('/api/search?q=ab', {}, remote)).json()).toEqual([]);
    const page = (await osm.request('/api/config', {}, remote)).headers.get('content-security-policy')!;
    expect(page).toContain("connect-src 'self';");
  });

  it('serves the configuration for the page, revalidated', async () => {
    const res = await app.request('/api/config', {}, remote);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    // The language comes from the address, the cookie or the browser.
    expect(res.headers.get('vary')).toContain('Accept-Language, Cookie');
    const body = (await res.json()) as typeof site.defaults;
    expect(body).toEqual(site.defaults);
    const again = await app.request('/api/config', { headers: { 'if-none-match': res.headers.get('etag')! } }, remote);
    expect(again.status).toBe(304);
  });

  it('answers 304 to the weak tag the compression middleware hands browsers', async () => {
    const first = await app.request('/api/capabilities', { headers: { 'accept-encoding': 'gzip' } }, remote);
    const etag = first.headers.get('etag')!;
    expect(etag.startsWith('W/')).toBe(true);
    const again = await app.request('/api/capabilities', { headers: { 'accept-encoding': 'gzip', 'if-none-match': etag } }, remote);
    expect(again.status).toBe(304);
    const list = await app.request('/api/capabilities', { headers: { 'if-none-match': `"other", ${etag}` } }, remote);
    expect(list.status).toBe(304);
  });

  it('serves health and capabilities with security headers', async () => {
    const res = await app.request('/api/health', {}, remote);
    expect(await res.json()).toEqual({ ok: true, capabilitiesGeneratedAt: CACHE.generatedAt });
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    // Half a year of HTTPS for this host alone: what else lives under the domain is not the app's to promise.
    expect(res.headers.get('strict-transport-security')).toBe('max-age=15552000');
    const caps = await app.request('/api/capabilities', {}, remote);
    // Revalidated every time, so a refresh reaches the app at once; unchanged costs a 304.
    expect(caps.headers.get('cache-control')).toBe('no-cache');
    const etag = caps.headers.get('etag')!;
    expect(etag).toMatch(/^"[ -~]+"$/);
    const again = await app.request('/api/capabilities', { headers: { 'if-none-match': etag } }, remote);
    expect(again.status).toBe(304);
    // A refresh changes the tag, so the app gets the new metadata at once.
    const { createApp } = await import('./app.ts');
    const refreshed = createApp({ site, cache: () => ({ ...CACHE, generatedAt: 'later' }) });
    expect((await refreshed.request('/api/capabilities', { headers: { 'if-none-match': etag } }, remote)).status).toBe(200);
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
  });

  it('serves the built app: the page, assets for a year, icons and thumbnails for a day, no page for a missing file', async () => {
    const { serveBuilt } = await import('./app.ts');
    const dist = await mkdtemp(join(tmpdir(), 'dist-'));
    await mkdir(join(dist, 'assets'));
    await mkdir(join(dist, 'thumbs'));
    await writeFile(join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
    await writeFile(join(dist, 'thumbs', 'mapa.jpg'), 'jpg');
    await writeFile(join(dist, 'favicon.svg'), '<svg/>');
    const built = new Hono();
    serveBuilt(built, (c) => c.html('<p>page</p>'), dist);
    const header = async (path: string) => (await built.request(path)).headers.get('cache-control');
    expect(await header('/assets/index-abc123.js')).toBe('public, max-age=31536000, immutable');
    expect(await header('/thumbs/mapa.jpg')).toBe('public, max-age=86400');
    expect(await header('/favicon.svg')).toBe('public, max-age=86400');
    expect(await header('/assets/index-old.js')).toBeNull();
    expect((await built.request('/assets/index-old.js')).status).toBe(404);
    expect((await built.request('/apple-touch-icon.png')).status).toBe(404);
    for (const path of ['/', '/index.html', '/en/']) expect(await (await built.request(path)).text()).toBe('<p>page</p>');
    await rm(dist, { recursive: true, force: true });
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
    const visitor = client('198.51.100.7');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 503 })),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await app.request('/api/dict/wojewodztwa', {}, visitor)).status);
    expect(statuses).toEqual([502, 502, 429]);
  });

  it('names units for the geocoder and validates the codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 503 })),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const visitor = client('198.51.100.8');
    expect((await app.request('/api/dict/jednostki?teryt=abc', {}, visitor)).status).toBe(400);
    expect((await app.request('/api/dict/jednostki?teryt=141708', {}, visitor)).status).toBe(502);
  });

  it('searches units by name, answering short queries without asking upstream', async () => {
    const fetchMock = vi.fn(async () => new Response('boom', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const visitor = client('198.51.100.9');
    const short = await app.request('/api/dict/szukaj?q=w', {}, visitor);
    expect(await short.json()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    const down = await app.request('/api/dict/szukaj?q=otwock', {}, visitor);
    expect(down.status).toBe(502);
    expect(await down.text()).toBe('Upstream service unavailable');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/dict\/szukaj: /));
  });

  it('answers 400 for an orthophoto query outside Poland', async () => {
    const visitor = client('198.51.100.10');
    expect((await app.request('/api/orto?x=1&y=2', {}, visitor)).status).toBe(400);
    expect((await app.request('/api/orto?x=abc&y=2', {}, visitor)).status).toBe(400);
  });

  it('asks the photo index once for the spellings of one point', async () => {
    const visitor = client('198.51.100.11');
    const page =
      '<script>skorDo5cm.push({url:"https://opendata.geoportal.gov.pl/a.tif", godlo:"N", aktualnosc:"2025-04-27", wielkoscPiksela:"0.05", kolor:"RGB"});</script>';
    const fetchMock = vi.fn(async () => new Response(page));
    vi.stubGlobal('fetch', fetchMock);
    for (const query of ['x=500000&y=600000', 'x=500000.0&y=600000', 'x=5e5&y=600000.4']) {
      const res = await app.request(`/api/orto?${query}`, {}, visitor);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ archived: 1 });
    }
    expect(fetchMock.mock.calls.map(String).filter((url) => url.includes('GetFeatureInfo'))).toHaveLength(1);
  });

  it('answers 400 for a map sheet query outside Poland or without a number for a coordinate', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const visitor = client('198.51.100.12');
    for (const query of ['x=1&y=2', 'x=abc&y=600000', 'x=500000', 'x=Infinity&y=600000']) {
      expect((await app.request(`/api/topo?${query}`, {}, visitor)).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('serves the map sheets of a point for a day, asking the index once, and reports the index being down in one sentence', async () => {
    const visitor = client('198.51.100.13');
    const page =
      '<table><thead><tr><th>Arkusz N-34-139-A Układ PL-1992</th></tr></thead><tbody><tr><th>Skala:</th> <td>1:50 000</td></tr><tr><th>Aktualność kartograficzna:</th> <td>1996</td></tr></tbody></table>';
    const fetchMock = vi.fn(async () => new Response(page, { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    for (const query of ['x=639000&y=487000', 'x=639000.4&y=487000.0']) {
      const res = await app.request(`/api/topo?${query}`, {}, visitor);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
      expect(await res.json()).toEqual({
        sheets: [{ date: '1996', scale: 50000, system: '1992', layer: 'Raster_50_1992', sheet: 'N-34-139-A' }],
      });
    }
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 503 })),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const down = await app.request('/api/topo?x=640000&y=488000', {}, visitor);
    expect(down.status).toBe(502);
    expect(await down.text()).toBe('Upstream service unavailable');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/topo: /));
  });

  it('links reports to the configured domain unless APP_ORIGIN says otherwise', async () => {
    const { createApp } = await import('./app.ts');
    const send = vi.fn<Mailer['send']>(async () => {});
    const view = `https://${site.config.app.domain}/?x=1`;
    const post = (to: Hono) =>
      to.request(
        '/api/report',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ category: site.mail.report.categories[0].id, message: 'x'.repeat(MESSAGE.min), view }),
        },
        remote,
      );
    expect((await post(createApp({ site, cache: () => CACHE, mailer: { send } }))).status).toBe(200);
    expect(send.mock.calls[0][0]).toMatchObject({ view });
    await post(createApp({ site, cache: () => CACHE, mailer: { send }, origin: 'https://staging.example' }));
    expect(send.mock.calls[1][0]).not.toHaveProperty('view', view);
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
  const visitor = client('198.51.100.20');

  it('answers 503 while the first catalog is being built', async () => {
    const { createApp } = await import('./app.ts');
    const building = createApp({ site, cache: () => CACHE, moduleData: { catalog: () => undefined } });
    expect((await building.request('/api/catalog', {}, visitor)).status).toBe(503);
  });

  it('lists the layers without addresses and gives one layer with its metadata, revalidated by ETag', async () => {
    const { createApp } = await import('./app.ts');
    const withCatalog = createApp({ site, cache: () => CACHE, moduleData: { catalog: () => CATALOG } });
    const list = await withCatalog.request('/api/catalog', {}, visitor);
    const body = (await list.json()) as { entries: Record<string, unknown>[] };
    expect(body.entries.map((e) => e.id)).toEqual(['msZabytki', 'msCLC']);
    expect(body.entries[0].url).toBeUndefined();
    expect((await withCatalog.request('/api/catalog', { headers: { 'if-none-match': list.headers.get('etag')! } }, visitor)).status).toBe(
      304,
    );

    const one = (await (await withCatalog.request('/api/catalog/msZabytki', {}, visitor)).json()) as {
      entry: { url: string };
      meta: { title: string };
    };
    expect(one.entry.url).toBe('https://nid.example/wms');
    expect(one.meta.title).toBe('NID');
    expect((await withCatalog.request('/api/catalog/msNope', {}, visitor)).status).toBe(404);
  });

  it('serves layers whose geoportal id has Polish letters', async () => {
    const { createApp } = await import('./app.ts');
    const polish = { ...CATALOG, entries: [{ ...CATALOG.entries[0], id: 'msWyłozeniaModernizacja' }] };
    const res = await createApp({ site, cache: () => CACHE, moduleData: { catalog: () => polish } }).request(
      `/api/catalog/${encodeURIComponent('msWyłozeniaModernizacja')}`,
      {},
      visitor,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toMatch(/^"[ -~]+"$/);
  });

  it('queries available catalog layers through the proxy and refuses unavailable ones', async () => {
    const { createApp } = await import('./app.ts');
    const withCatalog = createApp({ site, cache: () => CACHE, moduleData: { catalog: () => CATALOG } });
    const fetchMock = vi.fn(async (_url: string) => new Response('<a/>', { headers: { 'content-type': 'text/xml' } }));
    vi.stubGlobal('fetch', fetchMock);
    const q = 'QUERY_LAYERS=monuments&BBOX=1,2,3,4&WIDTH=10&HEIGHT=10&I=1&J=1&INFO_FORMAT=text/xml';
    expect((await withCatalog.request(`/api/featureinfo/msZabytki?${q}`, {}, visitor)).status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain('https://nid.example/wms?');
    expect((await withCatalog.request(`/api/featureinfo/msCLC?${q}`, {}, visitor)).status).toBe(400);
  });
});
