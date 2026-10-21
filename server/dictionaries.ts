import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RequestError, readLimited } from './http.ts';

/**
 * Administrative dictionaries for the parcel search: voivodeships, counties and
 * municipalities from the PRG search service, cadastral precincts from ULDK.
 * Both sources are slow or unstable at times, so every list is cached on disk;
 * when a refresh fails, the last good copy is served.
 *
 * A code is accepted only when its parent list contains it, so the set of cache keys
 * is bounded by the real administrative division, not by what a client sends.
 */

export interface DictEntry {
  /** TERYT code as ULDK expects it in parcel ids: 14, 1417, 141708_2, 141708_2.0021. */
  id: string;
  name: string;
}

const PRG = 'https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/MapServer';
const ULDK = 'https://uldk.gugik.gov.pl/';
const TTL_MS = 30 * 24 * 3600 * 1000;
/** Empty answers are retried sooner: a county may have been temporarily unavailable. */
const EMPTY_TTL_MS = 6 * 3600 * 1000;
const TIMEOUT_MS = 20000;
const MAX_BYTES = 2_000_000;
const MAX_PAGES = 5;
const CACHE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'dict');

interface Cached {
  fetchedAt: number;
  entries: DictEntry[];
}

const memory = new Map<string, Cached>();
const pending = new Map<string, Promise<DictEntry[]>>();

const fileFor = (key: string) => resolve(CACHE_DIR, `${key}.json`);

async function readDisk(key: string): Promise<Cached | undefined> {
  try {
    return JSON.parse(await readFile(fileFor(key), 'utf8')) as Cached;
  } catch {
    return undefined;
  }
}

/** One upstream request per key at a time, however many users ask; the result is stored once. */
function loadOnce(key: string, load: () => Promise<DictEntry[]>): Promise<DictEntry[]> {
  let request = pending.get(key);
  if (!request) {
    request = load()
      .then(async (entries) => {
        memory.set(key, { fetchedAt: Date.now(), entries });
        if (entries.length > 0) {
          await mkdir(CACHE_DIR, { recursive: true });
          await writeFile(fileFor(key), JSON.stringify(memory.get(key)));
        }
        return entries;
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return request;
}

/** Fresh copy from memory or disk; otherwise load, and on failure fall back to a stale copy. */
async function cached(key: string, load: () => Promise<DictEntry[]>): Promise<DictEntry[]> {
  const hit = memory.get(key) ?? (await readDisk(key));
  if (hit) {
    memory.set(key, hit);
    const ttl = hit.entries.length > 0 ? TTL_MS : EMPTY_TTL_MS;
    if (Date.now() - hit.fetchedAt < ttl) return hit.entries;
  }
  try {
    return await loadOnce(key, load);
  } catch (e) {
    if (hit) return hit.entries;
    throw e;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(new TextDecoder().decode(await readLimited(res, MAX_BYTES))) as T;
}

const byName = (a: DictEntry, b: DictEntry) => a.name.localeCompare(b.name, 'pl');

interface PrgRow {
  teryt: string;
  nazwa: string;
}

/** PRG search layers: 2 voivodeships, 1 counties, 0 municipalities (paged, 1000 per request). */
async function prg(layer: number, terytPrefix: string): Promise<PrgRow[]> {
  const out: PrgRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const q = new URLSearchParams({
      where: terytPrefix ? `teryt like '${terytPrefix}%'` : '1=1',
      outFields: 'teryt,nazwa',
      returnGeometry: 'false',
      orderByFields: 'teryt',
      resultOffset: String(page * 1000),
      resultRecordCount: '1000',
      f: 'json',
    });
    const data = await fetchJson<{ features?: { attributes: PrgRow }[]; error?: unknown }>(`${PRG}/${layer}/query?${q}`);
    if (data.error || !data.features) throw new Error('PRG query failed');
    out.push(...data.features.map((f) => f.attributes));
    if (data.features.length < 1000) break;
  }
  return out;
}

/** The code must come from the parent list, which bounds the cache to real units. */
async function ensureKnown(parent: Promise<DictEntry[]>, id: string, what: string): Promise<void> {
  if (!(await parent).some((e) => e.id === id)) throw new RequestError(`Unknown ${what}`);
}

export function voivodeships(): Promise<DictEntry[]> {
  return cached('woj', async () => (await prg(2, '')).map((r) => ({ id: r.teryt, name: r.nazwa })).sort(byName));
}

export async function counties(voivodeship: string): Promise<DictEntry[]> {
  if (!/^\d{2}$/.test(voivodeship)) throw new RequestError('Invalid voivodeship');
  await ensureKnown(voivodeships(), voivodeship, 'voivodeship');
  return cached(`pow-${voivodeship}`, async () =>
    (await prg(1, voivodeship)).map((r) => ({ id: r.teryt, name: r.nazwa })).sort(byName),
  );
}

/**
 * Cities whose land register is kept per district: PRG lists the city as one municipality,
 * while parcel ids use the district units (TERYT types 8 and 9). Verified in ULDK 2026-10-21;
 * Poznań and Wrocław have a single unit and need no entry.
 */
const CITY_DISTRICTS: Record<string, { city: string; districts: [string, string][] }> = {
  '1465011': {
    city: 'Warszawa',
    districts: [
      ['146502_8', 'Bemowo'], ['146503_8', 'Białołęka'], ['146504_8', 'Bielany'], ['146505_8', 'Mokotów'],
      ['146506_8', 'Ochota'], ['146507_8', 'Praga-Południe'], ['146508_8', 'Praga-Północ'], ['146509_8', 'Rembertów'],
      ['146510_8', 'Śródmieście'], ['146511_8', 'Targówek'], ['146512_8', 'Ursus'], ['146513_8', 'Ursynów'],
      ['146514_8', 'Wawer'], ['146515_8', 'Wesoła'], ['146516_8', 'Wilanów'], ['146517_8', 'Włochy'],
      ['146518_8', 'Wola'], ['146519_8', 'Żoliborz'],
    ],
  },
  '1261011': {
    city: 'Kraków',
    districts: [['126102_9', 'Krowodrza'], ['126103_9', 'Nowa Huta'], ['126104_9', 'Podgórze'], ['126105_9', 'Śródmieście']],
  },
  '1061011': {
    city: 'Łódź',
    districts: [['106102_9', 'Bałuty'], ['106103_9', 'Górna'], ['106104_9', 'Polesie'], ['106105_9', 'Śródmieście'], ['106106_9', 'Widzew']],
  },
};

/** Municipalities, or cadastral units where a city is split into districts. PRG writes 1417082, ULDK uses 141708_2. */
export async function communes(county: string): Promise<DictEntry[]> {
  if (!/^\d{4}$/.test(county)) throw new RequestError('Invalid county');
  await ensureKnown(counties(county.slice(0, 2)), county, 'county');
  return cached(`gmi-${county}`, async () =>
    (await prg(0, county))
      .filter((r) => /^\d{7}$/.test(r.teryt))
      .flatMap((r) => {
        const split = CITY_DISTRICTS[r.teryt];
        if (split) return split.districts.map(([id, name]) => ({ id, name: `${split.city}-${name}` }));
        return [{ id: `${r.teryt.slice(0, 6)}_${r.teryt[6]}`, name: r.nazwa }];
      })
      .sort(byName),
  );
}

/** ULDK lists every precinct of a municipality for GetRegionById with the municipality id. */
export async function precincts(commune: string): Promise<DictEntry[]> {
  if (!/^\d{6}_\d$/.test(commune)) throw new RequestError('Invalid municipality');
  await ensureKnown(communes(commune.slice(0, 4)), commune, 'municipality');
  return cached(`obr-${commune}`, async () => {
    const q = new URLSearchParams({ request: 'GetRegionById', id: commune, result: 'teryt,region' });
    const res = await fetch(`${ULDK}?${q}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`ULDK ${res.status}`);
    const [status, ...rows] = new TextDecoder().decode(await readLimited(res, MAX_BYTES)).trim().split('\n');
    if (status.startsWith('-1')) return [];
    if (!status.startsWith('0')) throw new Error('ULDK error status');
    return rows
      .map((r) => r.split('|'))
      .filter(([id]) => /^\d{6}_\d\.\d{4}$/.test(id))
      .map(([id, name]) => ({ id, name: name || id.slice(-4) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pl', { numeric: true }));
  });
}
