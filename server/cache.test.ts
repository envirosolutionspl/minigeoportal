import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaults } from './testSite.ts';

// Upstream hosts resolve to a public address without asking a real DNS server.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '203.0.113.10', family: 4 }]) }));

// A data directory and a configuration directory of its own, so neither the developer's cache
// nor the default deployment's seed is found.
let dir: string;
let cache: typeof import('./cache.ts');
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cache-'));
  vi.stubEnv('DATA_DIR', join(dir, 'data'));
  vi.stubEnv('CONFIG_DIR', join(dir, 'config'));
  vi.resetModules();
  cache = await import('./cache.ts');
});
afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe('startingCache', () => {
  it('starts at once without any metadata; shared instances leave the building to the updater', async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetch);
    const built = vi.fn();
    expect(await cache.startingCache(defaults, true, built)).toEqual({ generatedAt: '', services: {} });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('builds the metadata in the background on a single instance and hands it over', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 })),
    );
    const built = vi.fn();
    const start = await cache.startingCache(defaults, false, built);
    expect(start.services).toEqual({});
    await vi.waitFor(() => expect(built).toHaveBeenCalled());
    expect(built.mock.lastCall![0].generatedAt).not.toBe('');
    expect(JSON.parse(await readFile(cache.CACHE_FILE, 'utf8')).generatedAt).toBe(built.mock.lastCall![0].generatedAt);
  });

  it('takes the file on disk, else the seed of the configuration, and builds nothing', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await mkdir(join(dir, 'config', 'seed'), { recursive: true });
    await writeFile(join(dir, 'config', 'seed', 'capabilities.json'), '{"generatedAt":"seed","services":{}}');
    await rm(cache.CACHE_FILE, { force: true });
    expect((await cache.startingCache(defaults, false, vi.fn())).generatedAt).toBe('seed');
    await writeFile(cache.CACHE_FILE, '{"generatedAt":"disk","services":{}}');
    expect((await cache.startingCache(defaults, false, vi.fn())).generatedAt).toBe('disk');
    expect(fetch).not.toHaveBeenCalled();
  });
});
