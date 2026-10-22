import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { buildCache } from './capabilities.ts';
import { dataPath } from './config.ts';

/** Metadata of the registry services; tracked in git, so a fresh checkout starts with scale limits. */
const CACHE_FILE = process.env.CAPABILITIES_FILE ?? dataPath('capabilities.json');

export async function readCache(): Promise<CapabilitiesCache | undefined> {
  try {
    return JSON.parse(await readFile(CACHE_FILE, 'utf8')) as CapabilitiesCache;
  } catch {
    return undefined;
  }
}

export async function refreshCache(): Promise<CapabilitiesCache> {
  const cache = await buildCache(await readCache());
  await mkdir(dirname(CACHE_FILE), { recursive: true });
  // Written next to the target and renamed, so a crash never leaves half a file.
  await writeFile(`${CACHE_FILE}.tmp`, `${JSON.stringify(cache, null, 1)}\n`);
  await rename(`${CACHE_FILE}.tmp`, CACHE_FILE);
  return cache;
}
