import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ClientConfig } from '../shared/config.ts';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { buildCache } from './capabilities.ts';
import { config, dataPath, errorMessage } from './config.ts';
import { writeAtomic } from './files.ts';

/** Metadata of the configured services, refreshed by `npm run update`. */
export const CACHE_FILE = dataPath('capabilities.json');
/**
 * The copy that comes with the configuration (seed/ in its directory), so a fresh checkout or an
 * empty data volume starts with scale limits before the first update.
 */
const SEED_FILE = resolve(config.configDir, 'seed', 'capabilities.json');

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

/**
 * The metadata the server starts with: from disk (or the seed), else none for now. Nothing waits
 * for the upstream servers before the server listens: a single instance builds the cache in the
 * background and hands it over through `onBuilt`; instances sharing the data directory leave that
 * to the updater and pick up its file (index.ts follows it).
 */
export async function startingCache(
  config: ClientConfig,
  shared: boolean,
  onBuilt: (cache: CapabilitiesCache) => void,
): Promise<CapabilitiesCache> {
  const cache = await readCache();
  if (cache) return cache;
  if (!shared) {
    refreshCache(config)
      .then(onBuilt)
      .catch((e: unknown) => console.warn(`capabilities: ${errorMessage(e)}`));
  }
  return { generatedAt: '', services: {} };
}
