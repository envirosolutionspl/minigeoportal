import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { errorMessage } from './config.ts';

/** Files in the data directory, which several instances may share (SHARED_DATA=1). */

/**
 * Written next to the target under a unique name and renamed, so a crash never leaves half a
 * file and instances sharing the data directory never write into each other's copy (containers
 * may all run the server under the same pid, so the pid alone would not do).
 */
export async function writeAtomic(file: string, text: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
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
 * Reads a file again whenever it changes (checked every `everyMs`): an instance picks up what
 * its daily refresh, a cron run of `npm run update` or, with a shared data directory, the
 * updater wrote, all within a minute.
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

/**
 * Runs `task` every `everyMs`, never twice at once: a slow run (the catalog checks every service)
 * makes the next one wait for the following turn.
 */
export function repeat(task: () => Promise<void>, everyMs: number, label: string): () => void {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    await task().catch((e: unknown) => console.warn(`${label}: ${errorMessage(e)}`));
    running = false;
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
