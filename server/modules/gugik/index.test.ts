import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaults } from '../../testSite.ts';

// Upstream hosts resolve to a public address, so the address check lets them through.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '203.0.113.10', family: 4 }]) }));

// A catalog file of its own; it is there from the start, so nothing is built.
let dir: string;
let file: string;
let gugik: typeof import('./index.ts');
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gugik-'));
  file = join(dir, 'catalog.json');
  // Read when used, so it is set for the whole file (stubbed variables go back before each test).
  process.env.CATALOG_FILE = file;
  vi.resetModules();
  gugik = await import('./index.ts');
});
afterAll(async () => {
  delete process.env.CATALOG_FILE;
  await rm(dir, { recursive: true, force: true });
});

const catalog = (generatedAt: string) => JSON.stringify({ generatedAt, entries: [], services: {} });

describe('start', () => {
  it('reads the catalog again when a refresh or a cron run of the update rewrites it', async () => {
    await writeFile(file, catalog('first'));
    vi.useFakeTimers();
    const data = await gugik.start(defaults);
    expect(data.catalog?.()?.generatedAt).toBe('first');
    await writeFile(file, catalog('second'));
    await utimes(file, new Date(), new Date(Date.now() + 5000));
    await vi.advanceTimersByTimeAsync(30000);
    await vi.waitFor(() => expect(data.catalog?.()?.generatedAt).toBe('second'));
    vi.useRealTimers();
  });
});

describe('update', () => {
  const alerts = () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    return () => error.mock.calls.map((c) => String(c[0]));
  };
  afterEach(() => vi.restoreAllMocks());

  it('raises an alarm when the configuration has not been read for over three days', async () => {
    const old = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
    await writeFile(file, catalog(old));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('timeout'))),
    );
    const said = alerts();
    await gugik.update(defaults);
    expect(said()).toEqual([`CRITICAL Geoportal configuration unreadable since ${old}`]);
  });

  it('raises an alarm when the sheet indexes answer with nothing in the middle of Warsaw', async () => {
    await writeFile(file, catalog(new Date().toISOString()));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<p>nothing</p>', { headers: { 'content-type': 'text/html' } })),
    );
    const said = alerts();
    await gugik.update(defaults);
    expect(said()).toEqual([expect.stringMatching(/^CRITICAL Sheet index parser found nothing .*orthophotos, topographic maps$/)]);
  });
});
