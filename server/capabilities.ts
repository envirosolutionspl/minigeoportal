import { XMLParser } from 'fast-xml-parser';
import { fetchPublic, readLimited, serviceUrl } from './http.ts';
import * as modules from './modules/index.ts';
import { errorMessage } from './config.ts';
import type { ClientConfig } from '../shared/config.ts';
import type { CapabilitiesCache, RestMeta, ServiceMeta, TileMatrixMeta, WmsLayerMeta, WmsMeta, WmtsMeta } from '../src/services/meta.ts';

const ARRAYS = new Set([
  'Layer',
  'Format',
  'InfoFormat',
  'Style',
  'LegendURL',
  'TileMatrixSet',
  'TileMatrix',
  'TileMatrixSetLink',
  'Dimension',
]);
/** Tile formats in order of preference; WMTS also lists text formats for GetFeatureInfo. */
const TILE_FORMATS = ['image/png', 'image/png8', 'image/jpeg'];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (name) => ARRAYS.has(name),
});

// fast-xml-parser yields loosely typed trees; narrow access goes through these helpers.
type Node = Record<string, unknown>;
const node = (v: unknown): Node => (v && typeof v === 'object' ? (v as Node) : {});
const list = (v: unknown): Node[] => (Array.isArray(v) ? v.map(node) : v ? [node(v)] : []);
const text = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v.trim() || undefined;
  if (v && typeof v === 'object' && '#text' in v) return text((v as Node)['#text']);
  return undefined;
};
const texts = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map(text).filter((t): t is string => t !== undefined);
const num = (v: unknown): number | undefined => {
  const n = Number(text(v));
  return Number.isFinite(n) ? n : undefined;
};

const TIMEOUT_MS = 30000;
const MAX_BYTES = 5_000_000;

/** Text of an XML body in the encoding its declaration names (some servers answer in ISO-8859-2). */
function decodeXml(bytes: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const encoding = /encoding=["']([\w-]+)["']/i.exec(head)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

async function fetchXml(url: string): Promise<Node> {
  const res = await fetchPublic(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`HTTP ${res.status}`);
  }
  return node(parser.parse(decodeXml(await readLimited(res, MAX_BYTES))));
}

/**
 * Named layers of a WMS layer tree; scale hints, queryable and dimensions (time, elevation) are
 * inherited as the WMS spec requires.
 */
function collectLayers(
  layer: Node,
  inherited: Pick<WmsLayerMeta, 'minScale' | 'maxScale' | 'queryable' | 'dimensions'>,
  out: Record<string, WmsLayerMeta>,
): void {
  const dimensions = { ...inherited.dimensions };
  for (const d of list(layer.Dimension)) {
    const name = text(d['@name'])?.toLowerCase();
    const values = text(d);
    const fallback = text(d['@default']);
    if (name && values) dimensions[name] = { values, ...(fallback ? { default: fallback } : {}) };
  }
  const own = {
    queryable: layer['@queryable'] !== undefined ? layer['@queryable'] === '1' : inherited.queryable,
    minScale: num(layer.MinScaleDenominator) ?? inherited.minScale,
    maxScale: num(layer.MaxScaleDenominator) ?? inherited.maxScale,
    ...(Object.keys(dimensions).length ? { dimensions } : {}),
  };
  const name = text(layer.Name);
  if (name) {
    const legend = list(list(layer.Style)[0]?.LegendURL)[0];
    const href = text(node(legend?.OnlineResource)['@href']);
    const group = list(layer.Layer).length > 0;
    out[name] = { title: text(layer.Title) ?? name, ...own, ...(href ? { legend: href } : {}), ...(group ? { group } : {}) };
  }
  for (const child of list(layer.Layer)) collectLayers(child, own, out);
}

/** Layers, scale limits, legends and GetFeatureInfo formats of any WMS, from its GetCapabilities. */
export async function wmsCapabilities(url: string, fallbackTitle = ''): Promise<WmsMeta> {
  const root = node((await fetchXml(serviceUrl(url, { SERVICE: 'WMS', REQUEST: 'GetCapabilities', VERSION: '1.3.0' }))).WMS_Capabilities);
  const capability = node(root.Capability);
  const layers: Record<string, WmsLayerMeta> = {};
  for (const top of list(capability.Layer)) collectLayers(top, { queryable: false }, layers);
  if (Object.keys(layers).length === 0) throw new Error('No layers in capabilities');
  const gfi = node(node(capability.Request).GetFeatureInfo);
  return {
    kind: 'wms',
    fetchedAt: new Date().toISOString(),
    title: text(node(root.Service).Title) ?? fallbackTitle,
    infoFormats: texts(gfi.Format),
    layers,
  };
}

/** A coordinate system services are read for: the map's (map.yaml: projection). */
export interface MapCrs {
  code: string;
  axisOrientation: 'enu' | 'neu';
}

const epsgNumber = (crs: MapCrs) => Number(crs.code.split(':')[1]);

/**
 * Layer, image format, style and tile grid of a WMTS in the map's system, from its
 * GetCapabilities. Without a layer name the first layer of the service is taken.
 */
export async function wmtsCapabilities(url: string, crs: MapCrs, layer?: string): Promise<WmtsMeta> {
  const root = node((await fetchXml(serviceUrl(url, { SERVICE: 'WMTS', REQUEST: 'GetCapabilities', VERSION: '1.0.0' }))).Capabilities);
  const contents = node(root.Contents);
  const layers = list(contents.Layer);
  const found = layer === undefined ? layers[0] : layers.find((l) => text(l.Identifier) === layer);
  if (!found) throw new Error(`Layer ${layer ?? ''} not found`);
  const linked = new Set(list(found.TileMatrixSetLink).flatMap((l) => texts(l.TileMatrixSet)));
  // EPSG:2180, urn:ogc:def:crs:EPSG::2180 and urn:ogc:def:crs:EPSG:6.18.3:3857 all name their system last.
  const system = new RegExp(`EPSG:(?:[0-9.]*:)?${epsgNumber(crs)}$`);
  const set = list(contents.TileMatrixSet).find(
    (s) => (linked.size === 0 || linked.has(text(s.Identifier) ?? '')) && system.test(text(s.SupportedCRS) ?? text(s.Identifier) ?? ''),
  );
  if (!set) throw new Error(`Unsupported: no ${crs.code} tile matrix set`);
  const matrices = list(set.TileMatrix);
  if (matrices.length === 0) throw new Error('Empty tile matrix set');
  // The top-left corner follows the axis order of the system: northing first in PL-1992.
  const corner = (text(matrices[0].TopLeftCorner) ?? '').split(/\s+/).map(Number);
  const [east, north] = crs.axisOrientation === 'neu' ? [corner[1], corner[0]] : corner;
  const formats = texts(found.Format);
  const styles = list(found.Style);
  const style = styles.find((st) => st['@isDefault'] === 'true') ?? styles[0];
  return {
    kind: 'wmts',
    fetchedAt: new Date().toISOString(),
    title: text(node(root.ServiceIdentification).Title) ?? text(found.Identifier) ?? '',
    layer: text(found.Identifier),
    format: TILE_FORMATS.find((f) => formats.includes(f)) ?? formats.find((f) => f.startsWith('image/')) ?? 'image/png',
    style: text(style?.Identifier) ?? 'default',
    infoFormats: texts(found.InfoFormat),
    matrixSet: {
      id: text(set.Identifier) ?? '',
      origin: [east, north],
      tileSize: num(matrices[0].TileWidth) ?? 512,
      matrices: matrices.map((m): TileMatrixMeta => ({
        id: text(m.Identifier) ?? '',
        scale: num(m.ScaleDenominator) ?? 0,
        width: num(m.MatrixWidth) ?? 0,
        height: num(m.MatrixHeight) ?? 0,
      })),
    },
  };
}

interface ArcgisInfo {
  error?: { code?: number };
  mapName?: string;
  capabilities?: string;
  documentInfo?: { Title?: string };
  spatialReference?: { wkid?: number; latestWkid?: number };
  singleFusedMapCache?: boolean;
  tileInfo?: {
    rows: number;
    origin: { x: number; y: number };
    spatialReference?: { wkid?: number; latestWkid?: number };
    lods: { resolution: number }[];
  };
  layers?: { id: number; name: string; type?: string; minScale?: number; maxScale?: number; subLayerIds?: number[] | null }[];
}

const wkid = (sr?: { wkid?: number; latestWkid?: number }) => sr?.latestWkid ?? sr?.wkid;

/**
 * Layers and tile cache of an ArcGIS REST map service, from its description (?f=json).
 * A token request (HTTP 401 with a page, or error 499 inside the JSON) is reported as
 * "HTTP 499", the code the catalog reads as "token required" for every kind of service.
 */
export async function arcgisCapabilities(url: string, crs: MapCrs): Promise<RestMeta> {
  const res = await fetchPublic(serviceUrl(url.replace(/\/+$/, ''), { f: 'json' }), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = new TextDecoder().decode(await readLimited(res, MAX_BYTES));
  if (!res.ok) throw new Error(res.status === 401 && /token/i.test(body) ? 'HTTP 499' : `HTTP ${res.status}`);
  const info = JSON.parse(body) as ArcgisInfo;
  if (info.error) throw new Error(`HTTP ${info.error.code ?? 500}`);
  if (wkid(info.spatialReference) !== epsgNumber(crs)) throw new Error(`Unsupported: EPSG:${wkid(info.spatialReference)}`);
  const layers: Record<string, WmsLayerMeta> = {};
  // Identify answers for the layers of a service that allows queries, except groups and pictures.
  const query = /\bQuery\b/.test(info.capabilities ?? '');
  // ArcGIS minScale is the most zoomed-out scale, the WMS MaxScaleDenominator, and the reverse.
  for (const l of info.layers ?? []) {
    layers[String(l.id)] = {
      title: l.name,
      queryable: query && !l.subLayerIds?.length && l.type !== 'Raster Layer',
      ...(l.minScale ? { maxScale: l.minScale } : {}),
      ...(l.maxScale ? { minScale: l.maxScale } : {}),
      ...(l.subLayerIds?.length ? { group: true } : {}),
    };
  }
  const t = info.tileInfo;
  const tiles =
    info.singleFusedMapCache && t && wkid(t.spatialReference) === epsgNumber(crs)
      ? { origin: [t.origin.x, t.origin.y] as [number, number], tileSize: t.rows, resolutions: t.lods.map((l) => l.resolution) }
      : undefined;
  return {
    kind: 'rest',
    fetchedAt: new Date().toISOString(),
    title: info.documentInfo?.Title || info.mapName || '',
    layers,
    ...(tiles ? { tiles } : {}),
  };
}

async function safely(fetchMeta: () => Promise<ServiceMeta>): Promise<ServiceMeta> {
  try {
    return await fetchMeta();
  } catch (e) {
    return { kind: 'error', fetchedAt: new Date().toISOString(), error: errorMessage(e) };
  }
}

/** Metadata of a map service of any kind; a WMTS without a layer name gives its first layer. */
export function serviceCapabilities(
  s: { kind: 'wms' | 'wmts' | 'rest'; url: string; layer?: string },
  crs: MapCrs,
): Promise<WmsMeta | WmtsMeta | RestMeta> {
  if (s.kind === 'wmts') return wmtsCapabilities(s.url, crs, s.layer);
  return s.kind === 'rest' ? arcgisCapabilities(s.url, crs) : wmsCapabilities(s.url);
}

/**
 * Fetches capabilities of every configured service. A failed service keeps its previous
 * entry, so one unreachable server never wipes metadata that was already known.
 */
export async function buildCache(config: ClientConfig, previous?: CapabilitiesCache): Promise<CapabilitiesCache> {
  const { overlays } = config.layers;
  const crs = config.map.projection;
  // A WMTS overlay draws its first sublayer; XYZ tiles have no capabilities to read.
  const overlayMeta = (def: (typeof overlays)[number]) =>
    def.kind === 'wms' ? wmsCapabilities(def.url, def.title) : serviceCapabilities({ ...def, layer: def.sublayers[0].name }, crs);
  const [entries, drawOrder] = await Promise.all([
    Promise.all([
      ...overlays.map(async (def) => [def.id, await safely(() => overlayMeta(def))] as const),
      ...config.map.tileServices.flatMap((def) =>
        def.kind === 'wmts' ? [(async () => [def.id, await safely(() => wmtsCapabilities(def.url, crs, def.layer))] as const)()] : [],
      ),
    ]),
    // A layer order from outside the configuration (the gugik module); when it cannot be read, the last good one is kept.
    modules.drawOrder(config).catch((e: unknown) => {
      console.warn(`draw order: ${errorMessage(e)}`);
      return undefined;
    }),
  ]);
  const services: Record<string, ServiceMeta> = {};
  for (const [id, meta] of entries) {
    const old = previous?.services[id];
    // A service that does not answer keeps its previous metadata, said out loud rather than hidden.
    if (meta.kind === 'error' && old && old.kind !== 'error') console.warn(`${id}: ${meta.error} (previous metadata kept)`);
    services[id] = meta.kind === 'error' && old && old.kind !== 'error' ? old : meta;
  }
  const order = drawOrder ?? previous?.drawOrder;
  return { generatedAt: new Date().toISOString(), services, ...(order ? { drawOrder: order } : {}) };
}
