import type { Context, Hono } from 'hono';
import type { ClientConfig } from '../../../shared/config.ts';
import type { QueryTarget } from '../../featureinfo.ts';
import { RequestError, rateLimit } from '../../http.ts';
import { config as env, errorMessage } from '../../config.ts';
import { follow } from '../../files.ts';
import type { AppFile, MapFile } from '../../config/schema.ts';
import { CATALOG_FILE, buildCatalog, catalogIndex, readCatalog, serviceKey, writeCatalog, type Catalog } from './catalog.ts';
import { MAX_QUERY, communes, counties, findUnits, precincts, unitNames, voivodeships, type DictEntry } from './dictionaries.ts';
import { fetchDrawOrder } from './drawOrder.ts';
import { orthoAt } from './ortho.ts';
import { GUGIK_SEARCH_HOSTS } from './searchHosts.ts';

/**
 * The server side of the gugik module (geoportal.gov.pl and the GUGiK services), as the registry
 * (../index.ts) hands it to the server: its configuration rules, its data (the layer catalog),
 * its routes (TERYT dictionaries, the catalog, the photo index) and the hosts its search reaches.
 */

/** A problem of the configuration: the file, where in it, and what is wrong. */
export interface Problem {
  file: 'app.yaml' | 'map.yaml' | 'layers.yaml';
  path: (string | number)[];
  message: string;
}

/** Rules of the module across the configuration files (server/config/load.ts adds file, line and column). */
export function validate(app: AppFile, map?: MapFile): Problem[] {
  const problems: Problem[] = [];
  const on = app.modules.gugik?.enabled === true;
  const add = (path: (string | number)[], message: string) => problems.push({ file: 'app.yaml', path, message });
  if (app.search.provider === 'gugik' && !on) add(['search', 'provider'], 'search.provider gugik needs modules.gugik.enabled');
  if (app.search.parcel && !on) add(['search', 'parcel'], 'search.parcel needs modules.gugik.enabled');
  if (!on || !map) return problems;
  // GUGiK services, the parcel search and the photo index all work in PL-1992.
  if (map.projection.code !== 'EPSG:2180') add(['modules', 'gugik'], 'modules.gugik needs map.yaml projection EPSG:2180');
  const ortho = app.modules.gugik?.ortho;
  if (ortho && !map.tileServices.some((s) => s.id === ortho.service)) {
    add(['modules', 'gugik', 'ortho', 'service'], `modules.gugik.ortho.service: unknown tile service "${ortho.service}"`);
  }
  return problems;
}

/** Hosts the page asks directly: the GUGiK search services, with that search or the parcel search. */
export const connectSources = (client: ClientConfig) =>
  client.search.provider === 'gugik' || client.search.parcel ? GUGIK_SEARCH_HOSTS : [];

/** The drawing order of geoportal.gov.pl for the configured layers (modules.gugik.drawOrder). */
export const drawOrder = (client: ClientConfig): Promise<string[] | undefined> =>
  client.modules.gugik?.drawOrder ? fetchDrawOrder(client.layers.overlays) : Promise.resolve(undefined);

/** What the module keeps while the server runs: the layer catalog as last built or read. */
export interface Data {
  /** Undefined while the first build runs. */
  catalog?: () => Catalog | undefined;
}

/**
 * The layer catalog, read from disk. A single instance builds it in the background on its first
 * start (a minute or two: every service is checked), so it answers at once and the app works on
 * its own layers meanwhile; instances sharing the data directory wait for the updater and read
 * the catalog again when it changes.
 */
export async function start(client: ClientConfig): Promise<Data> {
  if (!client.modules.gugik?.catalog) return {};
  let catalog = await readCatalog();
  if (!catalog && !env.sharedData) {
    buildCatalog(client.layers.overlays)
      .then(async (built) => {
        catalog = built;
        await writeCatalog(built);
      })
      .catch((e: unknown) => console.warn(`catalog: ${errorMessage(e)}`));
  }
  if (env.sharedData) {
    await follow(CATALOG_FILE, async () => {
      catalog = (await readCatalog()) ?? catalog;
    });
  }
  return { catalog: () => catalog };
}

/** Rebuilds the layer catalog (npm run update). */
export async function update(client: ClientConfig): Promise<void> {
  if (!client.modules.gugik?.catalog) return;
  const started = Date.now();
  const catalog = await buildCatalog(client.layers.overlays, await readCatalog());
  await writeCatalog(catalog);
  const count: Record<string, number> = {};
  for (const e of catalog.entries) count[e.status] = (count[e.status] ?? 0) + 1;
  console.log(`catalog: ${catalog.entries.length} layers in ${Math.round((Date.now() - started) / 1000)} s:`, count);
}

/**
 * A layer of the catalog may be queried when its service answered the last check: a WMS for the
 * layer names of its capabilities and of the geoportal configuration, a WMTS that lists
 * GetFeatureInfo formats for its tile layer, an ArcGIS service for its queryable layer ids.
 */
export function queryTarget(data: Data, id: string): QueryTarget | undefined {
  const current = data.catalog?.();
  const entry = current?.entries.find((e) => e.id === id);
  if (!current || !entry || entry.status !== 'ok') return undefined;
  const meta = current.services[serviceKey(entry)]?.meta;
  if (meta?.kind === 'wmts') {
    const { layer, style = 'default', format = 'image/png', infoFormats = [], matrixSet } = meta;
    if (!layer || infoFormats.length === 0) return undefined;
    const wmts = {
      layer,
      style,
      format,
      matrixSet: matrixSet.id,
      matrices: new Set(matrixSet.matrices.map((m) => m.id)),
      tileSize: matrixSet.tileSize,
      infoFormats: new Set(infoFormats),
    };
    return { kind: 'wmts', url: entry.url, layers: new Set([layer]), wmts };
  }
  if (meta?.kind === 'rest') {
    const queryable = Object.entries(meta.layers)
      .filter(([, l]) => l.queryable)
      .map(([id]) => id);
    return { kind: 'rest', url: entry.url, layers: new Set(queryable) };
  }
  if (entry.kind !== 'wms') return undefined;
  const named = meta?.kind === 'wms' ? Object.keys(meta.layers) : [];
  return { url: entry.url, layers: new Set([...named, ...(entry.sublayers ?? []).map((l) => l.name)]) };
}

/** What the routes share with the rest of the API (server/app.ts). */
export interface RouteDeps {
  client: ClientConfig;
  data: Data;
  /** Upstream requests at once, shared with the point queries. */
  upstream: <T>(task: () => Promise<T>) => Promise<T | undefined>;
  /** Logs an upstream error and answers 502 in one generic sentence. */
  upstreamFailure: (c: Context, where: string, e: unknown) => Response;
  /** Answers that change only with the caches: kept by the browser, checked every time (ETag). */
  revalidated: (c: Context, version: string, body: () => unknown) => Response;
  limits?: { dict?: [burst: number, perMinute: number]; ortho?: [burst: number, perMinute: number] };
}

/** The module's routes: TERYT dictionaries of the parcel and unit search, the geoportal catalog, the photo index. */
export function routes(app: Hono, { client, data, upstream, upstreamFailure, revalidated, limits }: RouteDeps): void {
  const gugik = client.modules.gugik;
  if (!gugik) return;

  const dictionary = (load: (parent: string) => Promise<DictEntry[]>) => async (c: Context) => {
    try {
      const entries = await load(c.req.param('parent') ?? '');
      c.header('Cache-Control', 'public, max-age=86400');
      return c.json(entries);
    } catch (e) {
      if (e instanceof RequestError) return c.text(e.message, 400);
      return upstreamFailure(c, 'dict', e);
    }
  };
  app.use('/api/dict/*', rateLimit(...(limits?.dict ?? [30, 60])));
  app.get(
    '/api/dict/wojewodztwa',
    dictionary(() => voivodeships()),
  );
  app.get('/api/dict/powiaty/:parent', dictionary(counties));
  app.get('/api/dict/gminy/:parent', dictionary(communes));
  app.get('/api/dict/obreby/:parent', dictionary(precincts));
  app.get('/api/dict/szukaj', async (c) => {
    try {
      const hits = await findUnits((c.req.query('q') ?? '').slice(0, MAX_QUERY));
      c.header('Cache-Control', 'public, max-age=86400');
      return c.json(hits);
    } catch (e) {
      return upstreamFailure(c, 'dict', e);
    }
  });
  app.get('/api/dict/jednostki', async (c) => {
    try {
      const names = await unitNames((c.req.query('teryt') ?? '').split(',').filter(Boolean));
      c.header('Cache-Control', 'public, max-age=86400');
      return c.json(names);
    } catch (e) {
      if (e instanceof RequestError) return c.text(e.message, 400);
      return upstreamFailure(c, 'dict', e);
    }
  });

  if (gugik.catalog) {
    /** Every layer of geoportal.gov.pl with its topic and availability; metadata come per layer. */
    let index: { of: Catalog; body: ReturnType<typeof catalogIndex> } | undefined;
    app.get('/api/catalog', (c) => {
      const current = data.catalog?.();
      if (!current) return c.text('Catalog not ready yet', 503);
      // The index is built once per catalog, not per request.
      if (index?.of !== current) index = { of: current, body: catalogIndex(current) };
      return revalidated(c, current.generatedAt, () => index!.body);
    });
    app.get('/api/catalog/:id', (c) => {
      const current = data.catalog?.();
      const entry = current?.entries.find((e) => e.id === c.req.param('id'));
      if (!current || !entry) return c.text('Not found', 404);
      return revalidated(c, `${current.generatedAt}-${encodeURIComponent(entry.id)}`, () => ({
        entry,
        meta: current.services[serviceKey(entry)]?.meta,
      }));
    });
  }

  if (gugik.ortho) {
    /** Date and pixel size of the aerial photo at a map click; one request per click. */
    app.use('/api/orto', rateLimit(...(limits?.ortho ?? [10, 30])));
    app.get('/api/orto', async (c) => {
      try {
        const info = await upstream(() => orthoAt(c.req.query('x'), c.req.query('y'), c.req.raw.signal));
        if (!info) return c.text('Busy, try again shortly', 503);
        c.header('Cache-Control', 'public, max-age=86400');
        return c.json(info);
      } catch (e) {
        if (e instanceof RequestError) return c.text(e.message, 400);
        return upstreamFailure(c, 'orto', e);
      }
    });
  }
}
