import { findParcels, type SearchHit } from './geocoder';

/** Administrative dictionaries served and cached by the backend (server/dictionaries.ts). */
export interface DictEntry {
  id: string;
  name: string;
}

export type DictLevel = 'wojewodztwa' | 'powiaty' | 'gminy' | 'obreby';

const memo = new Map<string, Promise<DictEntry[]>>();

async function load(key: string): Promise<DictEntry[]> {
  const res = await fetch(`/api/dict/${key}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as DictEntry[];
}

/** Forgets loaded lists; used by tests, which share one module instance. */
export const clearDictionaryCache = () => memo.clear();

export function dictionary(level: DictLevel, parent = ''): Promise<DictEntry[]> {
  const key = parent ? `${level}/${parent}` : level;
  let request = memo.get(key);
  if (!request) {
    // One quiet retry covers a restarting server or a dropped connection.
    request = load(key).catch(() => new Promise<void>((r) => setTimeout(r, 800)).then(() => load(key)));
    // A failed request is not remembered, so choosing again retries it.
    request.catch(() => memo.delete(key));
    memo.set(key, request);
  }
  return request;
}

/**
 * Parcel in a chosen precinct. The id "precinct.number" covers most parcels; parcels on
 * map sheets have ids with an "AR_n" part, so the fallback asks by precinct name and number
 * and keeps the hits from the chosen precinct.
 */
export async function parcelInPrecinct(precinct: DictEntry, number: string, signal: AbortSignal): Promise<SearchHit[]> {
  const nr = number.trim();
  const direct = await findParcels(`${precinct.id}.${nr}`, signal);
  if (direct.length > 0) return direct;
  const byName = await findParcels(`${precinct.name} ${nr}`, signal);
  return byName.filter((h) => h.detail?.includes(precinct.id));
}
