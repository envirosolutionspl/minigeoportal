import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { errorMessage } from './config.ts';

/** Files in the data directory, which several instances may share (SHARED_DATA=1). */

/**
 * Written next to the target under a name of this process and renamed, so a crash never leaves
 * half a file and instances sharing the data directory never write into each other's copy.
 */
export async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}

/** A missing file counts as never written. */
const modified = (file: string) =>
  stat(file).then(
    (s) => s.mtimeMs,
    () => 0,
  );

/**
 * Reads a file again whenever it changes (checked every `everyMs`): instances sharing the data
 * directory pick up what the updater wrote, all within a minute.
 */
export async function follow(file: string, read: () => Promise<void>, everyMs = 30000): Promise<() => void> {
  let seen = await modified(file);
  const timer = setInterval(async () => {
    const now = await modified(file);
    if (now === seen) return;
    seen = now;
    await read().catch((e: unknown) => console.warn(`${file}: ${errorMessage(e)}`));
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
