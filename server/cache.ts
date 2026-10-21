import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { buildCache } from './capabilities.ts';

export const CACHE_FILE =
  process.env.CAPABILITIES_FILE ?? resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'capabilities.json');

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
  await writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 1)}\n`);
  return cache;
}
