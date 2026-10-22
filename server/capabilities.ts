import { XMLParser } from 'fast-xml-parser';
import { fetchPublic, readLimited, serviceUrl } from './http.ts';
import { fetchDrawOrder } from './drawOrder.ts';
import { OVERLAYS, TILE_SERVICES, type Overlay, type TileService } from '../src/services/registry.ts';
import type {
  CapabilitiesCache,
  ServiceMeta,
  TileMatrixMeta,
  WmsLayerMeta,
  WmsMeta,
  WmtsMeta,
} from '../src/services/meta.ts';

const ARRAYS = new Set(['Layer', 'Format', 'Style', 'LegendURL', 'TileMatrixSet', 'TileMatrix', 'TileMatrixSetLink']);

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
    out[name] = { title: text(layer.Title) ?? name, ...own, ...(href ? { legend: href } : {}) };
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

async function wmts(def: TileService): Promise<WmtsMeta> {
  const root = node((await fetchXml(`${def.url}?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0`)).Capabilities);
  const contents = node(root.Contents);
  if (!list(contents.Layer).some((l) => text(l.Identifier) === def.layer)) throw new Error(`Layer ${def.layer} not found`);
  const set = list(contents.TileMatrixSet).find((s) => text(s.Identifier) === 'EPSG:2180');
  if (!set) throw new Error('No EPSG:2180 tile matrix set');
  const matrices = list(set.TileMatrix);
  if (matrices.length === 0) throw new Error('Empty tile matrix set');
  // EPSG:2180 lists the top-left corner as northing, easting.
  const [north, east] = (text(matrices[0].TopLeftCorner) ?? '').split(/\s+/).map(Number);
  return {
    kind: 'wmts',
    fetchedAt: new Date().toISOString(),
    title: text(node(root.ServiceIdentification).Title) ?? def.layer,
    matrixSet: {
      id: 'EPSG:2180',
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

async function safely(fetchMeta: () => Promise<ServiceMeta>): Promise<ServiceMeta> {
  try {
    return await fetchMeta();
  } catch (e) {
    return { kind: 'error', fetchedAt: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) };
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
      console.warn(`draw order: ${e instanceof Error ? e.message : String(e)}`);
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
