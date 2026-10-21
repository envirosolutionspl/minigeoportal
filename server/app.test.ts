import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import type { CapabilitiesCache } from '../src/services/meta.ts';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

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
    expect(caps.headers.get('cache-control')).toBe('public, max-age=3600');
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
