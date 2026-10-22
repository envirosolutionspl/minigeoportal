import { fromLonLat } from 'ol/proj';
import { EPSG2180 } from '@/map/projection';
import { unitNames, type UnitNames } from './units';
import { normalize } from './text';

/**
 * Search across GUGiK services: addresses, streets and exact place names from the universal
 * geocoder (UUG); places and physiographic objects (rivers, lakes, peaks) by the beginning of
 * their name from the geoportal full-text search (FTS, the search box of geoportal.gov.pl);
 * voivodeships, counties and municipalities from the PRG lists cached by the backend; parcels
 * from the parcel location service (ULDK). Every hit carries its geometry, or a way to fetch
 * it, so the map can zoom to it and outline it.
 */

export type HitKind = 'address' | 'street' | 'place' | 'unit' | 'nature' | 'parcel';
export type UnitLevel = 'woj' | 'pow' | 'gm';

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
  /** A town (miasto): listed before villages, units and objects of a similar name. */
  town?: boolean;
  /** Administrative unit; its boundary is fetched when the hit is chosen. */
  unit?: { level: UnitLevel; teryt: string; name: string };
}

const UUG = 'https://services.gugik.gov.pl/uug/';
const ULDK = 'https://uldk.gugik.gov.pl/';
const FTS = 'https://capap.gugik.gov.pl/api/fts/ref/qn';
const PRG = 'https://mapy.geoportal.gov.pl/wss/ims/maps/PRG_gugik_wyszukiwarka/MapServer';
const MAX_NATURE = 5;
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
async function ftsFeatures<P>(query: string, index: 'prngjo' | 'prngof', signal: AbortSignal) {
  const params = new URLSearchParams({ f: 'geojson', q: query, idx: index, cnt: '50', offs: '0' });
  const res = await fetch(`${FTS}?${params}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: { properties: P; geometry?: { type: string; coordinates: number[] | number[][] } }[] };
  return data.features ?? [];
}

async function fts(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const q = normalize(query);
  return (await ftsFeatures<FtsPlace>(query, 'prngjo', signal))
    .filter((f) => {
      const p = f.properties;
      return PLACE_KINDS.has(p.RODZAJOBIEKTU ?? '') && normalize(p.NAZWAGLOWNA ?? '').startsWith(q) && f.geometry?.type === 'Point';
    })
    .map((f) => {
      const p = f.properties;
      const [e, n] = fromLonLat(f.geometry!.coordinates as number[], EPSG2180);
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
        town: p.RODZAJOBIEKTU === 'miasto' || undefined,
        // Towns before villages ("Gorzów Wielkopolski" before the village Gorzów), then exact names.
        rank: (p.RODZAJOBIEKTU === 'miasto' ? 0 : 2) + (normalize(name) === q ? 0 : 1),
      };
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank: _, ...hit }) => hit);
}

interface FtsNature {
  NAZWAGLOWNA?: string;
  RODZAJOBIEKTU?: string;
}

/** Municipality code (6 digits) at a point, from PRG; used to say where a lake or a peak is. */
async function communeAt([x, y]: [number, number], signal: AbortSignal): Promise<string | undefined> {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x, y }),
    geometryType: 'esriGeometryPoint',
    inSR: '2180',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'teryt',
    returnGeometry: 'false',
    f: 'json',
  });
  const res = await fetch(`${PRG}/0/query?${params}`, { signal });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { features?: { attributes: { teryt?: string } }[] };
  const code = data.features?.[0]?.attributes.teryt;
  return code && /^\d{7}$/.test(code) ? code.slice(0, 6) : undefined;
}

/**
 * Rivers, lakes, peaks and other named objects from the national register of geographical
 * names. A word of the name may start with the query ("hańcza" finds Czarna Hańcza). The
 * register has points only: one for a lake or a peak, a series along a river.
 */
async function nature(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const q = normalize(query);
  const hits = (await ftsFeatures<FtsNature>(query, 'prngof', signal)).flatMap((f) => {
    const name = f.properties.NAZWAGLOWNA;
    const g = f.geometry;
    if (!name || !g || (g.type !== 'Point' && g.type !== 'MultiPoint')) return [];
    const n = normalize(name);
    const rank = n === q ? 0 : n.startsWith(q) ? 1 : n.split(/[\s-]+/).some((w) => w.startsWith(q)) ? 2 : -1;
    if (rank < 0) return [];
    const points = (g.type === 'Point' ? [g.coordinates as number[]] : (g.coordinates as number[][])).map(
      (c) => fromLonLat(c, EPSG2180) as [number, number],
    );
    const wkt = points.length === 1 ? undefined : `MULTIPOINT(${points.map(([x, y]) => `(${x} ${y})`).join(',')})`;
    const center = points[Math.floor(points.length / 2)];
    return [{ rank, hit: { kind: 'nature' as const, label: name, detail: f.properties.RODZAJOBIEKTU, center, wkt } }];
  });
  const top = hits.sort((a, b) => a.rank - b.rank).slice(0, MAX_NATURE).map((h) => h.hit);
  // Where each object is, so that the many "Czarny Staw" lakes can be told apart. Rivers and
  // other objects drawn with many points cross many municipalities, so they get none.
  const codes = await Promise.all(top.map((h) => (h.wkt ? undefined : communeAt(h.center, signal).catch(() => undefined))));
  signal.throwIfAborted();
  const names = await unitNames(codes.filter((c): c is string => Boolean(c)), signal);
  return top.map((h, i) => {
    const code = codes[i];
    const u = code ? names.get(code) : undefined;
    const where = u ? [u.commune && `gm. ${u.commune}`, `woj. ${u.voivodeship}`].filter(Boolean).join(', ') : '';
    return { ...h, detail: [h.detail, where].filter(Boolean).join(' · ') };
  });
}

interface UnitAnswer {
  level: UnitLevel;
  teryt: string;
  name: string;
  county?: string;
  voivodeship?: string;
}

const COMMUNE_TYPE: Record<string, string> = { '1': 'gmina miejska', '2': 'gmina wiejska', '3': 'gmina miejsko-wiejska' };

/** "województwo mazowieckie", "powiat otwocki", "miasto na prawach powiatu Kraków", "gmina Wiązowna". */
export function unitLabel(level: UnitLevel, teryt: string, name: string): string {
  if (level === 'woj') return `województwo ${name}`;
  if (level === 'pow') return Number(teryt.slice(2, 4)) >= 61 ? `miasto na prawach powiatu ${name}` : `powiat ${name}`;
  return `gmina ${name}`;
}

async function units(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  const res = await fetch(`/api/dict/szukaj?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) return [];
  return ((await res.json()) as UnitAnswer[]).map((u) => ({
    kind: 'unit' as const,
    label: unitLabel(u.level, u.teryt, u.name),
    detail: [u.level === 'gm' ? COMMUNE_TYPE[u.teryt[6]] : '', u.county && `pow. ${u.county}`, u.voivodeship && `woj. ${u.voivodeship}`]
      .filter(Boolean)
      .join(', '),
    unit: { level: u.level, teryt: u.teryt, name: u.name },
  }));
}

const PRG_LAYER: Record<UnitLevel, number> = { woj: 2, pow: 1, gm: 0 };
/** Generalisation in metres: outlines stay sharp on screen and small to download. */
const PRG_OFFSET: Record<UnitLevel, number> = { woj: 100, pow: 20, gm: 5 };

/** Boundary of a voivodeship, county or municipality from PRG, as WKT in EPSG:2180. */
export async function unitOutline(unit: NonNullable<SearchHit['unit']>, signal: AbortSignal): Promise<string | undefined> {
  if (!/^\d{2}(\d{2}(\d{3})?)?$/.test(unit.teryt)) return undefined;
  const params = new URLSearchParams({
    where: `teryt='${unit.teryt}'`,
    outFields: 'teryt',
    returnGeometry: 'true',
    outSR: '2180',
    maxAllowableOffset: String(PRG_OFFSET[unit.level]),
    geometryPrecision: '1',
    f: 'json',
  });
  const res = await fetch(`${PRG}/${PRG_LAYER[unit.level]}/query?${params}`, { signal });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { features?: { geometry?: { rings?: number[][][] } }[] };
  const rings = data.features?.[0]?.geometry?.rings;
  if (!rings?.length) return undefined;
  // Islands and holes as rings of one polygon: drawn with the even-odd rule, they look right.
  return `POLYGON(${rings.map((r) => `(${r.map(([x, y]) => `${x} ${y}`).join(',')})`).join(',')})`;
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
  // Names have no digits or commas; anything else is an address or a parcel.
  const byName = !/[\d,]/.test(q);
  const none = Promise.resolve<SearchHit[]>([]);
  const settled = await Promise.allSettled([
    PRECINCT_AND_NUMBER.test(q) ? findParcels(q, signal) : none,
    uug(q, signal),
    byName ? fts(q, signal) : none,
    byName ? units(q, signal) : none,
    byName ? nature(q, signal) : none,
  ]);
  const [parcels, geocoded, places, unitHits, natureHits] = settled.map((r) => (r.status === 'fulfilled' ? r.value : []));

  // Places in the full-text order (towns first), then the geocoder's places it did not know.
  const allPlaces = [...places, ...geocoded.filter((o) => o.kind === 'place' && !places.some((p) => samePlace(o, p)))];
  // Towns and exact names first: Gorzów Wielkopolski, then the village Gorzów; Wisła the town,
  // then the river; "mazowieckie" finds the voivodeship before streets and parts of towns.
  const exact = (h: SearchHit) => normalize(h.unit?.name ?? h.label) === normalize(q);
  const first = (h: SearchHit) => h.town || exact(h);
  const others = [unitHits, natureHits].flat();
  const merged = [
    ...parcels,
    ...geocoded.filter((o) => o.kind !== 'place'),
    ...allPlaces.filter(first),
    ...others.filter(exact),
    ...allPlaces.filter((h) => !first(h)),
    ...others.filter((h) => !exact(h)),
  ].slice(0, MAX_HITS);
  signal.throwIfAborted();
  const names = await unitNames(merged.flatMap((h) => (h.teryt && !h.detail?.includes('woj.') ? [h.teryt] : [])), signal);
  return merged.map((h) => withUnits(h, names));
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
