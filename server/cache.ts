import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClientConfig } from '../shared/config.ts';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { buildCache } from './capabilities.ts';
import { dataPath } from './config.ts';
import { writeAtomic } from './files.ts';

/** Metadata of the configured services, refreshed by `npm run update`. */
export const CACHE_FILE = process.env.CAPABILITIES_FILE ?? dataPath('capabilities.json');
/** The copy tracked in git, so a fresh checkout or an empty data volume starts with scale limits. */
const SEED_FILE = resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'capabilities.json');

export async function readCache(): Promise<CapabilitiesCache | undefined> {
  for (const file of new Set([CACHE_FILE, SEED_FILE])) {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as CapabilitiesCache;
    } catch {
      // Not there yet: the next one.
    }
  }
  return undefined;
}

export async function refreshCache(config: ClientConfig): Promise<CapabilitiesCache> {
  const cache = await buildCache(config, await readCache());
  await writeAtomic(CACHE_FILE, `${JSON.stringify(cache, null, 1)}\n`);
  return cache;
}
