import { XMLParser } from 'fast-xml-parser';
import { fetchPublic, readLimited, serviceUrl } from './http.ts';
import { fetchDrawOrder } from './drawOrder.ts';
import { errorMessage } from './config.ts';
import { OVERLAYS, TILE_SERVICES, type Overlay, type TileService } from '../src/services/registry.ts';
import type {
  CapabilitiesCache,
  RestMeta,
  ServiceMeta,
  TileMatrixMeta,
  WmsLayerMeta,
  WmsMeta,
  WmtsMeta,
} from '../src/services/meta.ts';

const ARRAYS = new Set(['Layer', 'Format', 'InfoFormat', 'Style', 'LegendURL', 'TileMatrixSet', 'TileMatrix', 'TileMatrixSetLink']);
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
const texts = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [v]).map(text).filter((t): t is string => t !== undefined);
const num = (v: unknown): number | undefined => {
  const n = Number(text(v));
  return Number.isFinite(n) ? n : undefined;
};

const TIMEOUT_MS = 30000;
const MAX_BYTES = 5_000_000;

async function fetchXml(url: string): Promise<Node> {
  const res = await fetchPublic(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return node(parser.parse(new TextDecoder().decode(await readLimited(res, MAX_BYTES))));
}

/** Named layers of a WMS layer tree; scale hints and queryable are inherited as the WMS spec requires. */
function collectLayers(
  layer: Node,
  inherited: Pick<WmsLayerMeta, 'minScale' | 'maxScale' | 'queryable'>,
  out: Record<string, WmsLayerMeta>,
): void {
  const own = {
    queryable: layer['@queryable'] !== undefined ? layer['@queryable'] === '1' : inherited.queryable,
    minScale: num(layer.MinScaleDenominator) ?? inherited.minScale,
    maxScale: num(layer.MaxScaleDenominator) ?? inherited.maxScale,
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

const wms = (def: Overlay) => wmsCapabilities(def.url, def.title);

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

const wmts = (def: TileService) => wmtsCapabilities(def.url, def.layer);

/**
 * Layer, image format, style and EPSG:2180 tile grid of a WMTS, from its GetCapabilities.
 * Without a layer name the first layer of the service is taken.
 */
export async function wmtsCapabilities(url: string, layer?: string): Promise<WmtsMeta> {
  const root = node((await fetchXml(serviceUrl(url, { SERVICE: 'WMTS', REQUEST: 'GetCapabilities', VERSION: '1.0.0' }))).Capabilities);
  const contents = node(root.Contents);
  const layers = list(contents.Layer);
  const found = layer === undefined ? layers[0] : layers.find((l) => text(l.Identifier) === layer);
  if (!found) throw new Error(`Layer ${layer ?? ''} not found`);
  const linked = new Set(list(found.TileMatrixSetLink).flatMap((l) => texts(l.TileMatrixSet)));
  const set = list(contents.TileMatrixSet).find(
    (s) => (linked.size === 0 || linked.has(text(s.Identifier) ?? '')) && /EPSG:+2180$/.test(text(s.SupportedCRS) ?? text(s.Identifier) ?? ''),
  );
  if (!set) throw new Error('Unsupported: no EPSG:2180 tile matrix set');
  const matrices = list(set.TileMatrix);
  if (matrices.length === 0) throw new Error('Empty tile matrix set');
  // EPSG:2180 lists the top-left corner as northing, easting.
  const [north, east] = (text(matrices[0].TopLeftCorner) ?? '').split(/\s+/).map(Number);
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
      matrices: matrices.map(
        (m): TileMatrixMeta => ({
          id: text(m.Identifier) ?? '',
          scale: num(m.ScaleDenominator) ?? 0,
          width: num(m.MatrixWidth) ?? 0,
          height: num(m.MatrixHeight) ?? 0,
        }),
      ),
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
 * ArcGIS asks for a token with HTTP 401 and a page, or with error 499 in the JSON.
 */
export async function arcgisCapabilities(url: string): Promise<RestMeta> {
  const res = await fetchPublic(serviceUrl(url.replace(/\/+$/, ''), { f: 'json' }), { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = new TextDecoder().decode(await readLimited(res, MAX_BYTES));
  if (!res.ok) throw new Error(res.status === 401 && /token/i.test(body) ? 'HTTP 499' : `HTTP ${res.status}`);
  const info = JSON.parse(body) as ArcgisInfo;
  if (info.error) throw new Error(`HTTP ${info.error.code ?? 500}`);
  if (wkid(info.spatialReference) !== 2180) throw new Error(`Unsupported: EPSG:${wkid(info.spatialReference)}`);
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
    info.singleFusedMapCache && t && wkid(t.spatialReference) === 2180
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

/**
 * Fetches capabilities of every registered service. A failed service keeps its previous
 * entry, so one unreachable server never wipes metadata that was already known.
 */
export async function buildCache(previous?: CapabilitiesCache): Promise<CapabilitiesCache> {
  const [entries, drawOrder] = await Promise.all([
    Promise.all([
      ...OVERLAYS.map(async (def) => [def.id, await safely(() => wms(def))] as const),
      ...TILE_SERVICES.map(async (def) => [def.id, await safely(() => wmts(def))] as const),
    ]),
    // The layer order of geoportal.gov.pl; when it cannot be read, the last good one is kept.
    fetchDrawOrder().catch((e: unknown) => {
      console.warn(`draw order: ${errorMessage(e)}`);
      return undefined;
    }),
  ]);
  const services: Record<string, ServiceMeta> = {};
  for (const [id, meta] of entries) {
    const old = previous?.services[id];
    services[id] = meta.kind === 'error' && old && old.kind !== 'error' ? old : meta;
  }
  const order = drawOrder ?? previous?.drawOrder;
  return { generatedAt: new Date().toISOString(), services, ...(order ? { drawOrder: order } : {}) };
}
