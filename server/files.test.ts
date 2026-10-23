import { mkdtemp, readdir, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { follow, writeAtomic } from './files.ts';

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));
const tempDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'files-'));
  dirs.push(dir);
  return dir;
};

describe('writeAtomic', () => {
  it('writes the whole file into new directories and leaves no temporary copy', async () => {
    const dir = await tempDir();
    const file = join(dir, 'a', 'b.json');
    await writeAtomic(file, '{"ok":true}');
    expect(await readFile(file, 'utf8')).toBe('{"ok":true}');
    expect(await readdir(join(dir, 'a'))).toEqual(['b.json']);
  });
});

describe('writeAtomic from several writers', () => {
  // Windows refuses to replace a file another rename is still touching; the server runs on Linux.
  it.skipIf(process.platform === 'win32')(
    'uses a temporary name of its own for each write, so writers sharing a directory never collide',
    async () => {
      const dir = await tempDir();
      const file = join(dir, 'c.json');
      await Promise.all(Array.from({ length: 8 }, (_, i) => writeAtomic(file, `{"n":${i}}`)));
      expect(await readFile(file, 'utf8')).toMatch(/^\{"n":\d\}$/);
      expect(await readdir(dir)).toEqual(['c.json']);
    },
  );
});

describe('follow', () => {
  it('reads a file again only after it changed', async () => {
    const file = join(await tempDir(), 'cache.json');
    await writeAtomic(file, '1');
    const read = vi.fn(async () => {});
    const stop = await follow(file, read, 20);
    await new Promise((r) => setTimeout(r, 60));
    expect(read).not.toHaveBeenCalled();
    await writeAtomic(file, '2');
    await utimes(file, new Date(), new Date(Date.now() + 5000));
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    stop();
  });
});
