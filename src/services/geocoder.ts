import { fromLonLat } from 'ol/proj';
import { EPSG2180 } from '@/map/projection';
import { unitNames, type UnitNames } from './units';
import { normalize } from './text';

/**
 * Search across GUGiK services: addresses, streets and exact place names from the universal
 * geocoder (UUG), places by the beginning of their name from the geoportal full-text search
 * (FTS, the search box of geoportal.gov.pl), parcels from the parcel location service (ULDK).
 * Every hit carries its geometry, or a way to fetch it, so the map can zoom to it and outline it.
 */

export type HitKind = 'address' | 'street' | 'place' | 'parcel';

export interface SearchHit {
  kind: HitKind;
  label: string;
  detail?: string;
  /** EPSG:2180 [easting, northing]; absent when the geometry says where the hit is. */
  center?: [number, number];
  /** WKT in EPSG:2180, when the service returned a geometry. */
  wkt?: string;
  /** 6-digit municipality TERYT code from the geocoder, used to name the units in `detail`. */
  teryt?: string;
}

const UUG = 'https://services.gugik.gov.pl/uug/';
const ULDK = 'https://uldk.gugik.gov.pl/';
const FTS = 'https://capap.gugik.gov.pl/api/fts/ref/qn';
const MAX_HITS = 10;

/** Full parcel id, e.g. 141708_2.0021.22/1. */
const PARCEL_ID = /^\d{6}_\d\.\d{4}(\.AR_\d+)?\.\S+$/i;
/** "Precinct name number", e.g. "Wiązowna Gminna 22/1": ends with a parcel number. */
const PRECINCT_AND_NUMBER = /^\p{L}[\p{L}\s.-]*\s\d+[\d/]*$/u;

/** ULDK returns EWKT ("SRID=2180;MULTIPOLYGON(...)"); OpenLayers reads plain WKT. */
export const stripSrid = (wkt: string) => wkt.replace(/^SRID=\d+;/i, '');

interface UugResult {
  teryt?: string;
  city?: string;
  citypart?: string | null;
  street?: string | null;
  number?: string | null;
  x?: string;
  y?: string;
  geometry_wkt?: string;
}

async function uug(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const url = `${UUG}?request=GetAddress&address=${encodeURIComponent(query)}&srid=2180`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { type?: string; results?: Record<string, UugResult> | null };
  const kind: HitKind = data.type === 'street' ? 'street' : data.type === 'city' ? 'place' : 'address';
  return Object.values(data.results ?? {}).flatMap((r) => {
    const x = Number(r.x);
    const y = Number(r.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    const street = [r.street, r.number].filter(Boolean).join(' ');
    return [
      {
        kind,
        label: street || r.city || query,
        detail: street ? [r.citypart, r.city].filter(Boolean).join(', ') : kind === 'place' ? 'Miejscowość' : undefined,
        center: [x, y] as [number, number],
        wkt: r.geometry_wkt,
        teryt: r.teryt,
      },
    ];
  });
}

/**
 * Adds the municipality, county and voivodeship to the detail line, so two places of one
 * name can be told apart. Parts equal to the place name itself (a town that is its own
 * municipality or county) are left out.
 */
function withUnits(hit: SearchHit, units: Map<string, UnitNames>): SearchHit {
  const u = hit.teryt && units.get(hit.teryt);
  if (!u) return hit;
  const place = hit.kind === 'place' ? hit.label : hit.detail?.split(', ').pop();
  const parts = [
    u.commune && u.commune !== place ? `gm. ${u.commune}` : '',
    u.county !== place ? `pow. ${u.county}` : '',
    hit.kind === 'place' ? `woj. ${u.voivodeship}` : '',
  ].filter(Boolean);
  const detail = hit.kind === 'place' ? parts.join(', ') : [hit.detail, ...parts].filter(Boolean).join(', ');
  return { ...hit, detail: detail || hit.detail };
}

/** Places, not parts of them: FTS also lists parts of towns and villages, which crowd the list. */
const PLACE_KINDS = new Set(['miasto', 'wieś', 'osada', 'kolonia', 'osada leśna', 'osada młyńska', 'osiedle']);

interface FtsPlace {
  NAZWAGLOWNA?: string;
  RODZAJOBIEKTU?: string;
  GMINA?: string | null;
  POWIAT?: string | null;
  WOJEWODZTWO?: string | null;
  IDENTYFIKATORGMINY?: string | null;
}

/** "Chełmek-gmina miejsko-wiejska" → "Chełmek". */
const communeName = (s?: string | null) => s?.replace(/-gmina .*$/, '') ?? '';

/**
 * Towns and villages whose name starts with the query, from the geoportal full-text search.
 * The geocoder finds only exact names ("Gorzów" but not "Gorzów Wielkopolski"); the full-text
 * search matches loosely ("Gorzków" for "gorzów"), so its hits are filtered by name prefix.
 */
async function fts(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const q = normalize(query);
  const params = new URLSearchParams({ f: 'geojson', q: query, idx: 'prngjo', cnt: '50', offs: '0' });
  const res = await fetch(`${FTS}?${params}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: { properties: FtsPlace; geometry?: { type: string; coordinates: number[] } }[] };
  return (data.features ?? [])
    .filter((f) => {
      const p = f.properties;
      return PLACE_KINDS.has(p.RODZAJOBIEKTU ?? '') && normalize(p.NAZWAGLOWNA ?? '').startsWith(q) && f.geometry?.type === 'Point';
    })
    .map((f) => {
      const p = f.properties;
      const [e, n] = fromLonLat(f.geometry!.coordinates, EPSG2180);
      const name = p.NAZWAGLOWNA!;
      const commune = communeName(p.GMINA);
      const detail = [
        commune && commune !== name ? `gm. ${commune}` : '',
        p.POWIAT && p.POWIAT !== name ? `pow. ${p.POWIAT}` : '',
        p.WOJEWODZTWO ? `woj. ${p.WOJEWODZTWO}` : '',
      ]
        .filter(Boolean)
        .join(', ');
      return {
        kind: 'place' as const,
        label: name,
        detail,
        center: [e, n] as [number, number],
        teryt: p.IDENTYFIKATORGMINY?.slice(0, 6),
        // Towns before villages ("Gorzów Wielkopolski" before the village Gorzów), then exact names.
        rank: (p.RODZAJOBIEKTU === 'miasto' ? 0 : 2) + (normalize(name) === q ? 0 : 1),
      };
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank: _, ...hit }) => hit);
}

/** The same place from both sources: same name in the same municipality. */
const samePlace = (a: SearchHit, b: SearchHit) =>
  a.kind === 'place' && b.kind === 'place' && normalize(a.label) === normalize(b.label) && a.teryt === b.teryt;

/** ULDK answers in text: first line is a count or "-1 brak wyników", then one "|"-separated row per hit. */
async function uldkRows(params: Record<string, string>, signal: AbortSignal): Promise<string[][]> {
  const res = await fetch(`${ULDK}?${new URLSearchParams({ ...params, srid: '2180' })}`, { signal });
  if (!res.ok) return [];
  const [status, ...rows] = (await res.text()).trim().split('\n');
  if (status.startsWith('-1')) return [];
  return rows.map((r) => r.split('|'));
}

/** Parcels by full id or "precinct name number"; several hits when precinct names repeat. */
export async function findParcels(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const rows = await uldkRows(
    { request: 'GetParcelByIdOrNr', id: query, result: 'id,commune,region,parcel,geom_wkt' },
    signal,
  );
  return rows.flatMap(([id, commune, region, parcel, wkt]) => {
    if (!wkt) return [];
    return [{ kind: 'parcel' as const, label: `Działka ${parcel}`, detail: `obręb ${region}, gm. ${commune} · ${id}`, wkt: stripSrid(wkt) }];
  });
}

export async function search(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const q = query.trim();
  if (PARCEL_ID.test(q)) return findParcels(q, signal);
  const lookups: Promise<SearchHit[]>[] = [uug(q, signal)];
  if (PRECINCT_AND_NUMBER.test(q)) lookups.unshift(findParcels(q, signal));
  // Place names have no digits or commas; anything else is an address or a parcel.
  const placeQuery = !/[\d,]/.test(q);
  if (placeQuery) lookups.push(fts(q, signal));
  const results = await Promise.allSettled(lookups);
  const [parcelsOrAddresses, ...rest] = results.map((r) => (r.status === 'fulfilled' ? r.value : []));
  const places = placeQuery ? rest.at(-1) ?? [] : [];
  const others = [parcelsOrAddresses, ...(placeQuery ? rest.slice(0, -1) : rest)].flat();
  // Places in the full-text order (towns first), then the geocoder's places it did not know.
  const merged = [
    ...others.filter((o) => o.kind !== 'place'),
    ...places,
    ...others.filter((o) => o.kind === 'place' && !places.some((p) => samePlace(o, p))),
  ].slice(0, MAX_HITS);
  const units = await unitNames(merged.flatMap((h) => (h.teryt && !h.detail?.includes('woj.') ? [h.teryt] : [])));
  return merged.map((h) => withUnits(h, units));
}

/**
 * Outline of a place: a town that is its own municipality gets the municipal boundary,
 * a village gets the cadastral precinct of the same name. Otherwise there is no outline.
 */
export async function placeOutline(hit: SearchHit, signal: AbortSignal): Promise<string | undefined> {
  if (!hit.center) return undefined;
  const xy = `${hit.center[0]},${hit.center[1]},2180`;
  const name = hit.label.toLowerCase();
  const [commune] = await uldkRows({ request: 'GetCommuneByXY', xy, result: 'commune,geom_wkt' }, signal);
  if (commune && commune[0].toLowerCase() === `${name} (miasto)`) return stripSrid(commune[1]);
  const [region] = await uldkRows({ request: 'GetRegionByXY', xy, result: 'region,geom_wkt' }, signal);
  if (region && region[0].toLowerCase().startsWith(name)) return stripSrid(region[1]);
  return undefined;
}

/** Outline of the building at a point (an address), from the land register via ULDK. */
export async function buildingAt(center: [number, number], signal: AbortSignal): Promise<string | undefined> {
  const [row] = await uldkRows(
    { request: 'GetBuildingByXY', xy: `${center[0]},${center[1]},2180`, result: 'geom_wkt' },
    signal,
  );
  return row?.[0] ? stripSrid(row[0]) : undefined;
}
