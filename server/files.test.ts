import { mkdtemp, readdir, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { follow, repeat, writeAtomic } from './files.ts';

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
    vi.useFakeTimers();
    const file = join(await tempDir(), 'cache.json');
    await writeAtomic(file, '1');
    const read = vi.fn(async () => {});
    const stop = await follow(file, read, 20);
    // Three checks of an unchanged file.
    await vi.advanceTimersByTimeAsync(60);
    expect(read).not.toHaveBeenCalled();
    await writeAtomic(file, '2');
    await utimes(file, new Date(), new Date(Date.now() + 5000));
    // The check reads the file's time from the disk, so the clock is turned while that comes.
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    stop();
    vi.useRealTimers();
  });
});

describe('repeat', () => {
  it('runs the task every turn but never twice at once, and goes on after a failure', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let finish = () => {};
    const task = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise((r) => (finish = r)))
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue();
    const stop = repeat(task, 1000, 'refresh');
    await vi.advanceTimersByTimeAsync(999);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledOnce();
    // The first run is still going: the next turn passes it by.
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledOnce();
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('refresh: down');
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(3);
    warn.mockRestore();
    vi.useRealTimers();
  });
});
