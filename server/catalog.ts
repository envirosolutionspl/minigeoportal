import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OVERLAYS, type Topic } from '../src/services/registry.ts';
import type { CatalogEntry, CatalogIndex, CatalogMeta, CatalogStatus } from '../src/services/catalogTypes.ts';
import { catalogSublayers } from '../src/services/catalogSublayers.ts';
import { normalize } from '../src/services/text.ts';
import { arcgisCapabilities, wmsCapabilities, wmtsCapabilities } from './capabilities.ts';
import { fetchGeoportalConfig, type ConfigService, type GeoportalConfig } from './geoportalConfig.ts';

/**
 * Catalog of every layer of geoportal.gov.pl, kept on disk and rebuilt on demand.
 *
 * The list, the groups, the drawing order and the sublayers come from the geoportal
 * configuration; each service is checked with GetCapabilities (WMS, WMTS) or its description
 * (ArcGIS REST), which also gives its metadata.
 * Layers added or removed in the geoportal appear or disappear here at the next refresh;
 * metadata follow the services. When the configuration cannot be read the previous catalog
 * stays, and a service that does not answer keeps its last known metadata.
 */

export interface CatalogService {
  url: string;
  status: CatalogStatus;
  /** What the server answered, e.g. "HTTP 403". */
  detail?: string;
  checked: string;
  meta?: CatalogMeta;
}

export interface Catalog {
  generatedAt: string;
  entries: CatalogEntry[];
  /** Per service (see serviceKey): availability and metadata. */
  services: Record<string, CatalogService>;
}

/** A WMTS serves several tile layers under one address, each with its own grid. */
export const serviceKey = (e: Pick<CatalogEntry, 'url' | 'layer'>) => (e.layer ? `${e.url} ${e.layer}` : e.url);

const CATALOG_FILE = process.env.CATALOG_FILE ?? resolve(dirname(fileURLToPath(import.meta.url)), 'data', 'catalog', 'catalog.json');
/** Services checked at once: the geoportal servers are shared with everyone. */
const CONCURRENCY = 6;
/** The main module first, so layers take their groups from where most people know them. */
const MAIN_MODULE = 'modulGK';

/**
 * Topic of a layer from its name and groups. The first rule that matches wins, so the more
 * specific topics (archival, hazards, heritage) come before the broad ones (terrain, other).
 */
const TOPIC_RULES: [Topic, RegExp][] = [
  ['archiwalne', /archiwal|historycz|pastmaps|_19[4-9]\d|\b19[4-9]\d\b|bdoo 2015/],
  ['zagrozenia', /powodz|zagroz|ostrzez|susz|wezbran|halas|osuwisk|podtop|azbest|awari|kryzys|imisyjn|emisyjn|meteo|prognoz|opad|wiatr|temperatur|cisnieni|zachmurzen|wilgotn|irradianc|skazen|promieniotw|iceye|synoptyczn|schron/],
  ['zabytki', /zabyt|unesco|pomnik|turyst|szlak|jaskin|dziedzict|rowerow|kajak|narciar|schronisk/],
  ['ceny', /\bcen[ay]?\b|rcn|transakc|rynek nieruchomosci|sprzedanych lokali/],
  ['planowanie', /plan|studium|urbanist|zagospodarowan|krajobrazow|turbin|rezerwac|zakazy inwestycyjne|port polska/],
  ['uzbrojenie', /uzbrojen|gesut|kiut|elektroenerget|sieci przesyl|kolej|przejazd|gazociag|wodociag|kilometraz|\bdrog|autostrad|pikietaz|eipa|ladowania|infrastruktura komunikac/],
  ['dzialki', /ewidencj|egib|dzialk|budyn|bdot500|kibdot|grunty skarbu|lpis|kowr|nieruchomosci amw|zasob kzn|modernizac|wlasnos/],
  ['granice', /granic|\bprg\b|adres|ulic|administracyjn|jednostk|wybory|obwod|rejon/],
  ['geodezja', /osnow|uklad|siatk|sekcj|asg|geodezyj|pzgik|informatyzac|portal|monitoring|skorowidz|sprawozdan|pobrani|evrf|kron|aerotriangul|mozaikowan|zasieg/],
  ['srodowisko', /przyrod|natura|siedlisk|gatun|\blas|lesn|gleb|\bwod|hydro|geolog|zloz|ochron|powietrz|klimat|energi|geoterm|gios|gdos|clc|corine|sozolog|wegetac|wysp[ay] ciepla/],
  ['teren', /orto|zdjec|nmt|nmpt|lidar|wysokos|hipsometr|cieniow|rzezb|szczyt|sentinel|satelit|bdoo|bdot10k|topograf|ogolnogeogr|pokrycia terenu|intensywnosc|3d|batymetr/],
];

export function topicOf(title: string, path: string[]): Topic {
  // Maps of where data can be downloaded look like the data itself ("Działki"): kept apart.
  if (normalize(path[0] ?? '') === 'dane do pobrania') return 'pobieranie';
  const text = normalize([title, ...path].join(' '));
  return TOPIC_RULES.find(([, re]) => re.test(text))?.[0] ?? 'inne';
}

/** Our own registry entries that show the same geoportal layer, by geoportal id. */
const CURATED = new Map(OVERLAYS.flatMap((o) => (o.geoportalId ? [[o.geoportalId, o.id] as const] : [])));

/**
 * Entries of the catalog: every layer some module lists, once, with its group path in the first
 * module that lists it and its rank in the drawing order (bottom to top, main module first).
 */
export function catalogEntries(config: GeoportalConfig): Omit<CatalogEntry, 'status' | 'detail' | 'checked'>[] {
  const modules = [...config.modules].sort((a, b) => (a.id === MAIN_MODULE ? -1 : b.id === MAIN_MODULE ? 1 : 0));
  const out = new Map<string, Omit<CatalogEntry, 'status' | 'detail' | 'checked'>>();
  /**
   * Modules define the same layer under different ids: one entry per service and sublayers. The
   * same name on one service is also one layer when one of the entries draws the whole service.
   */
  const sameLayer = new Map<string, Omit<CatalogEntry, 'status' | 'detail' | 'checked'>>();
  const visit = (id: string, path: string[], module: string, seen: Set<string>) => {
    const s = config.services.get(id);
    if (!s || seen.has(id)) return;
    if (s.type === 'group') {
      const inner = new Set(seen).add(id);
      for (const child of s.children ?? []) visit(child, [...path, s.label || id], module, inner);
      return;
    }
    if (!s.url || s.type === 'basemap') return;
    const url = s.url.replace(/\?$/, '');
    const key = `${url} ${s.layer ?? ''} ${(s.sublayers ?? []).map((l) => l.name).join(',')}`;
    const named = `${url} ${normalize(s.label || id)}`;
    const byName = sameLayer.get(named);
    const wholeService = !s.sublayers?.length || !byName?.sublayers?.length;
    const known = out.get(id) ?? sameLayer.get(key) ?? (wholeService ? byName : undefined);
    if (known) {
      if (!known.modules.includes(module)) known.modules.push(module);
      return;
    }
    const entry = entryFor(s, path, module, out.size);
    out.set(id, entry);
    sameLayer.set(key, entry);
    sameLayer.set(named, entry);
  };
  for (const m of modules) for (const id of m.layers) visit(id, [], m.label, new Set());
  return withoutReplaced([...out.values()]);
}

/**
 * The geoportal keeps some layers in an old and a new version under one name in one group: an
 * id ending in _new (msSkorowidzeSozo_new) or a sublayer called "Najnowsze ..." (msSozoArch).
 * Only the new one is listed; neither carries edition dates that a time view could use.
 */
function withoutReplaced<T extends Pick<CatalogEntry, 'id' | 'title' | 'path' | 'sublayers'>>(entries: T[]): T[] {
  const place = (e: T) => normalize([...e.path, e.title].join(' › '));
  const isNew = (e: T) => /_?new$/i.test(e.id) || (e.sublayers ?? []).some((l) => /^najnowsz/i.test(normalize(l.title)));
  const renewed = new Set(entries.filter(isNew).map(place));
  return entries.filter((e) => isNew(e) || !renewed.has(place(e)));
}

function entryFor(s: ConfigService, path: string[], module: string, order: number): Omit<CatalogEntry, 'status' | 'detail' | 'checked'> {
  const title = s.label || s.id;
  const kind = s.type === 'wms' ? 'wms' : s.type === 'wmts' ? 'wmts' : 'rest';
  return {
    id: s.id,
    title,
    path,
    modules: [module],
    topic: topicOf(title, path),
    kind,
    url: s.url!,
    order,
    ...(s.sublayers ? { sublayers: s.sublayers } : {}),
    ...(s.featureInfoFormat ? { infoFormat: s.featureInfoFormat } : {}),
    ...(kind === 'wmts' && (s.layer ?? s.sublayers?.[0]) ? { layer: s.layer ?? s.sublayers![0].name } : {}),
    ...(CURATED.has(s.id) ? { curated: CURATED.get(s.id) } : {}),
  };
}

/** Status of a failed check, from the error: token, refused, or not answering. */
export function failureStatus(error: unknown): { status: CatalogStatus; detail: string } {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { cause?: { code?: string } })?.cause?.code;
  if (/HTTP 499/.test(message)) return { status: 'token', detail: 'HTTP 499: Token Required' };
  if (/^Unsupported: /.test(message)) return { status: 'unsupported', detail: message.slice('Unsupported: '.length) };
  if (/HTTP 40[13]/.test(message)) return { status: 'refused', detail: message };
  return { status: 'down', detail: code ?? message.slice(0, 120) };
}

const capabilities = (e: Pick<CatalogEntry, 'kind' | 'url' | 'layer'>): Promise<CatalogMeta> =>
  e.kind === 'wms' ? wmsCapabilities(e.url) : e.kind === 'wmts' ? wmtsCapabilities(e.url, e.layer) : arcgisCapabilities(e.url);

async function checkService(e: Pick<CatalogEntry, 'kind' | 'url' | 'layer'>, previous: CatalogService | undefined): Promise<CatalogService> {
  const { url } = e;
  const checked = new Date().toISOString();
  try {
    // One more try for a server that is slow at the moment rather than refusing.
    const meta = await capabilities(e).catch((err: unknown) => {
      if (failureStatus(err).status !== 'down') throw err;
      return capabilities(e);
    });
    return { url, status: 'ok', checked, meta };
  } catch (err) {
    const { status, detail } = failureStatus(err);
    // A server that is down now keeps its last metadata, so it works again when it returns.
    return { url, status, detail, checked, ...(previous?.meta ? { meta: previous.meta } : {}) };
  }
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

/** Builds the catalog anew; keeps the previous one if the geoportal configuration cannot be read. */
export async function buildCatalog(previous?: Catalog, log: (line: string) => void = console.log): Promise<Catalog> {
  let config: GeoportalConfig;
  try {
    config = await fetchGeoportalConfig();
  } catch (e) {
    if (previous) {
      log(`catalog: configuration not read (${e instanceof Error ? e.message : e}), previous catalog kept`);
      return previous;
    }
    throw e;
  }
  const entries = catalogEntries(config);
  const unique = [...new Map(entries.map((e) => [serviceKey(e), e])).entries()];
  const checked = await mapLimited(unique, CONCURRENCY, async ([key, e]) => [key, await checkService(e, previous?.services[key])] as const);
  const services = Object.fromEntries(checked);
  const now = new Date().toISOString();
  const full = entries.map((e): CatalogEntry => {
    const s = services[serviceKey(e)];
    return { ...e, status: s.status, ...(s.detail ? { detail: s.detail } : {}), checked: s.checked };
  });
  if (previous) {
    const before = new Set(previous.entries.map((e) => e.id));
    const after = new Set(full.map((e) => e.id));
    const added = full.filter((e) => !before.has(e.id)).length;
    const removed = previous.entries.filter((e) => !after.has(e.id)).length;
    log(`catalog: ${full.length} layers (${added} added, ${removed} removed)`);
  }
  return { generatedAt: now, entries: full, services };
}

/** What the app gets first: the list, without addresses and metadata, with sublayer counts. */
export function catalogIndex(catalog: Catalog): CatalogIndex {
  return {
    generatedAt: catalog.generatedAt,
    entries: catalog.entries.map((e) => {
      const { url: _u, sublayers: _s, infoFormat: _i, modules: _m, layer: _l, ...rest } = e;
      const parts = e.status === 'ok' ? catalogSublayers(e, catalog.services[serviceKey(e)]?.meta).length : 0;
      return parts > 1 ? { ...rest, parts } : rest;
    }),
  };
}

export async function readCatalog(): Promise<Catalog | undefined> {
  try {
    return JSON.parse(await readFile(CATALOG_FILE, 'utf8')) as Catalog;
  } catch {
    return undefined;
  }
}

export async function writeCatalog(catalog: Catalog): Promise<void> {
  await mkdir(dirname(CATALOG_FILE), { recursive: true });
  // Written next to the target and renamed, so a crash never leaves half a file.
  await writeFile(`${CATALOG_FILE}.tmp`, JSON.stringify(catalog));
  await rename(`${CATALOG_FILE}.tmp`, CATALOG_FILE);
}
