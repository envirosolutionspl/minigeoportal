import type { Overlay } from '../shared/config.ts';
import { RequestError, fetchPublic, readLimited, serviceUrl } from './http.ts';

/**
 * Point query proxy: WMS and WMTS GetFeatureInfo, ArcGIS REST identify. The browser cannot query integration services directly: they
 * redirect to county and city servers, and a CORS request that follows a cross-origin
 * redirect carries `Origin: null`, which some of those servers reject. The server follows
 * the redirects itself.
 *
 * Only registered services are reachable, every parameter is validated and rebuilt here,
 * redirects may lead only to public hosts on web ports, and the answer is read with a size
 * cap and one deadline for the whole chain. A client that goes away ends the upstream request.
 */

const MAX_REDIRECTS = 5;
const MAX_BYTES = 1_000_000;
const DEADLINE_MS = 12000;
const MAX_FEATURES = 50;
const MAX_PIXELS = 4096;
const INFO_FORMATS = new Set(['text/xml', 'text/html', 'application/vnd.ogc.gml', 'text/plain']);

interface FeatureInfoResult {
  contentType: string;
  body: string;
}

const int = (value: string | null, min: number, max: number): number | undefined => {
  if (value === null || !/^\d{1,5}$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
};

/** A service that may be queried and the layer names (ArcGIS: layer ids) it may be asked about. */
export interface QueryTarget {
  /** WMS when absent. */
  kind?: 'wms' | 'wmts' | 'rest';
  url: string;
  layers: ReadonlySet<string>;
  /** The tile layer of a WMTS, which GetFeatureInfo names along with the tile. */
  wmts?: {
    layer: string;
    style: string;
    format: string;
    matrixSet: string;
    matrices: ReadonlySet<string>;
    tileSize: number;
    infoFormats: ReadonlySet<string>;
  };
}

/** A configured overlay; other layers (the geoportal catalog) come from the caller's lookup. */
export function overlayTarget(def: Overlay): QueryTarget {
  return { url: def.url, layers: new Set(def.sublayers.map((l) => l.name)) };
}

/** Layers named in QUERY_LAYERS, all of them known to the service. */
function queryLayers(def: QueryTarget, query: URLSearchParams): string[] {
  const known = def.layers;
  const layers = (query.get('QUERY_LAYERS') ?? '').split(',').filter(Boolean);
  if (layers.length === 0 || layers.length > known.size || !layers.every((l) => known.has(l))) {
    throw new RequestError('Invalid QUERY_LAYERS');
  }
  return layers;
}

/** The map window around the clicked pixel, as WMS and ArcGIS identify both describe it. */
function mapWindow(query: URLSearchParams) {
  const bbox = (query.get('BBOX') ?? '').split(',').map(Number);
  if (bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new RequestError('Invalid BBOX');
  const width = int(query.get('WIDTH'), 1, MAX_PIXELS);
  const height = int(query.get('HEIGHT'), 1, MAX_PIXELS);
  const i = int(query.get('I'), 0, MAX_PIXELS);
  const j = int(query.get('J'), 0, MAX_PIXELS);
  if (width === undefined || height === undefined || i === undefined || j === undefined) {
    throw new RequestError('Invalid WIDTH, HEIGHT, I or J');
  }
  return { bbox, width, height, i, j };
}

/** Validated query of one known service: WMS 1.3.0, WMTS 1.0.0 or ArcGIS REST identify. */
function buildParams(def: QueryTarget | undefined, query: URLSearchParams, crs: string): string {
  if (!def) throw new RequestError('Unknown service');
  if (def.kind === 'wmts') return wmtsParams(def, query);
  if (def.kind === 'rest') return identifyParams(def, query, crs);

  const layers = queryLayers(def, query);
  const { bbox, width, height, i, j } = mapWindow(query);

  const infoFormat = query.get('INFO_FORMAT') ?? 'text/html';
  if (!INFO_FORMATS.has(infoFormat)) throw new RequestError('Invalid INFO_FORMAT');
  const featureCount = int(query.get('FEATURE_COUNT'), 1, MAX_FEATURES) ?? 10;

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetFeatureInfo',
    VERSION: '1.3.0',
    CRS: crs,
    LAYERS: layers.join(','),
    QUERY_LAYERS: layers.join(','),
    STYLES: '',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    BBOX: bbox.map((n) => n.toFixed(2)).join(','),
    WIDTH: String(width),
    HEIGHT: String(height),
    I: String(i),
    J: String(j),
    INFO_FORMAT: infoFormat,
    FEATURE_COUNT: String(featureCount),
  });
  return serviceUrl(def.url, params);
}

/** WMTS GetFeatureInfo names a pixel of one tile of the grid the server described. */
function wmtsParams(def: QueryTarget, query: URLSearchParams): string {
  const tiles = def.wmts;
  if (!tiles) throw new RequestError('Unknown service');
  const matrix = query.get('TILEMATRIX') ?? '';
  if (!tiles.matrices.has(matrix)) throw new RequestError('Invalid TILEMATRIX');
  const row = int(query.get('TILEROW'), 0, 99999);
  const col = int(query.get('TILECOL'), 0, 99999);
  const i = int(query.get('I'), 0, tiles.tileSize - 1);
  const j = int(query.get('J'), 0, tiles.tileSize - 1);
  if (row === undefined || col === undefined || i === undefined || j === undefined) {
    throw new RequestError('Invalid TILEROW, TILECOL, I or J');
  }
  const infoFormat = query.get('INFOFORMAT') ?? '';
  if (!tiles.infoFormats.has(infoFormat)) throw new RequestError('Invalid INFOFORMAT');
  const params = new URLSearchParams({
    SERVICE: 'WMTS',
    REQUEST: 'GetFeatureInfo',
    VERSION: '1.0.0',
    LAYER: tiles.layer,
    STYLE: tiles.style,
    FORMAT: tiles.format,
    TILEMATRIXSET: tiles.matrixSet,
    TILEMATRIX: matrix,
    TILEROW: String(row),
    TILECOL: String(col),
    I: String(i),
    J: String(j),
    INFOFORMAT: infoFormat,
  });
  return serviceUrl(def.url, params);
}

/** ArcGIS identify at the clicked point, for the given layer ids, in the map's system. */
function identifyParams(def: QueryTarget, query: URLSearchParams, crs: string): string {
  const layers = queryLayers(def, query);
  const { bbox, width, height, i, j } = mapWindow(query);
  const [minX, minY, maxX, maxY] = bbox;
  const x = minX + ((maxX - minX) * i) / width;
  const y = maxY - ((maxY - minY) * j) / height;
  const params = new URLSearchParams({
    f: 'json',
    geometry: `${x.toFixed(2)},${y.toFixed(2)}`,
    geometryType: 'esriGeometryPoint',
    sr: crs.split(':')[1],
    layers: `visible:${layers.join(',')}`,
    tolerance: '5',
    mapExtent: bbox.map((n) => n.toFixed(2)).join(','),
    imageDisplay: `${width},${height},96`,
    returnGeometry: 'false',
  });
  return serviceUrl(`${def.url.replace(/\/+$/, '')}/identify`, params);
}

export async function featureInfo(
  serviceId: string,
  query: URLSearchParams,
  lookup: (id: string) => QueryTarget | undefined,
  /** The map's coordinate system, e.g. EPSG:2180: the BBOX is in it. */
  crs: string,
  abort?: AbortSignal,
): Promise<FeatureInfoResult> {
  const url = buildParams(lookup(serviceId), query, crs);
  const deadline = AbortSignal.timeout(DEADLINE_MS);
  const signal = abort ? AbortSignal.any([deadline, abort]) : deadline;
  // Catalog addresses come from the geoportal configuration: checked like redirects.
  const res = await fetchPublic(url, { signal }, MAX_REDIRECTS);
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Upstream HTTP ${res.status}`);
  }
  const contentType = res.headers.get('content-type') ?? 'text/plain';
  const bytes = await readLimited(res, MAX_BYTES);
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
  let body: string;
  try {
    body = new TextDecoder(charset).decode(bytes);
  } catch {
    body = new TextDecoder().decode(bytes);
  }
  return { contentType: contentType.split(';')[0].trim().slice(0, 100), body };
}
