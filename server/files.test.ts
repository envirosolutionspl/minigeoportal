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
