import { fetchText } from '../http.ts';
import type { PlaceHit } from '../../shared/search.ts';

/**
 * Place search through Nominatim (OpenStreetMap) under its usage policy
 * (https://operations.osmfoundation.org/policies/nominatim/): the server asks for everyone, at
 * most once a second, names the app in its User-Agent and remembers answers, so a repeated
 * search costs the service nothing. A busy queue answers "try again" instead of growing.
 */

export interface NominatimOptions {
  url: string;
  /** Names the app and where it runs, as the policy asks. */
  userAgent: string;
  countryCodes?: string[];
  /** WGS 84 [minLon, minLat, maxLon, maxLat]: results inside come first. */
  viewbox?: [number, number, number, number];
  /** Pause between requests to the service; the public one allows one a second. */
  intervalMs?: number;
}

interface NominatimRow {
  display_name: string;
  lat: string;
  lon: string;
  /** [minLat, maxLat, minLon, maxLon] as strings. */
  boundingbox: [string, string, string, string];
  addresstype?: string;
  type?: string;
}

export const MAX_QUERY = 200;
const MAX_HITS = 10;
/** Requests waiting for their turn; more get "busy" at once. */
const MAX_WAITING = 20;
const CACHE_SIZE = 1000;
const TIMEOUT_MS = 10000;
const MAX_BYTES = 500_000;

const toHit = (r: NominatimRow): PlaceHit => {
  const [minLat, maxLat, minLon, maxLon] = r.boundingbox.map(Number);
  return {
    label: r.display_name,
    point: [Number(r.lon), Number(r.lat)],
    bbox: [minLon, minLat, maxLon, maxLat],
    type: r.addresstype ?? r.type ?? '',
  };
};

/** A search function: hits for a query in a language, or undefined when too many requests wait. */
export function nominatimSearch({ url, userAgent, countryCodes, viewbox, intervalMs = 1000 }: NominatimOptions) {
  const cache = new Map<string, PlaceHit[]>();
  let queue: Promise<void> = Promise.resolve();
  let waiting = 0;
  let next = 0;

  /** Resolves when this request may go; requests leave one by one, `intervalMs` apart. */
  const turn = () => {
    waiting++;
    const mine = queue.then(async () => {
      const wait = next - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      next = Date.now() + intervalMs;
      waiting--;
    });
    queue = mine;
    return mine;
  };

  return async (query: string, language: string): Promise<PlaceHit[] | undefined> => {
    const q = query.trim().slice(0, MAX_QUERY);
    const key = `${language}\n${q.toLowerCase()}`;
    const known = cache.get(key);
    if (known) {
      // Most recently used last: the oldest answer is the first to go.
      cache.delete(key);
      cache.set(key, known);
      return known;
    }
    if (waiting >= MAX_WAITING) return undefined;
    await turn();
    const params = new URLSearchParams({ q, format: 'jsonv2', limit: String(MAX_HITS), 'accept-language': language });
    if (countryCodes?.length) params.set('countrycodes', countryCodes.join(','));
    if (viewbox) params.set('viewbox', viewbox.join(','));
    const body = await fetchText(`${url.replace(/\/+$/, '')}/search?${params}`, {
      timeoutMs: TIMEOUT_MS,
      maxBytes: MAX_BYTES,
      headers: { 'User-Agent': userAgent },
    });
    const hits = (JSON.parse(body) as NominatimRow[]).map(toHit);
    cache.set(key, hits);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
    return hits;
  };
}
