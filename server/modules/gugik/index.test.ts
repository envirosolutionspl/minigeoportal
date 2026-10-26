import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaults } from '../../testSite.ts';

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
