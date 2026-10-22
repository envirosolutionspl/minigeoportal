import { OVERLAY_BY_ID } from '../src/services/registry.ts';
import { RequestError, publicWebUrl, readLimited, serviceUrl } from './http.ts';

/**
 * GetFeatureInfo proxy. The browser cannot query integration services directly: they
 * redirect to county and city servers, and a CORS request that follows a cross-origin
 * redirect carries `Origin: null`, which some of those servers reject. The server follows
 * the redirects itself.
 *
 * Only registered services are reachable, every parameter is validated and rebuilt here,
 * redirects may lead only to public hosts on web ports, and the answer is read with a size
 * cap and one deadline for the whole chain.
 */

const MAX_REDIRECTS = 5;
const MAX_BYTES = 1_000_000;
const DEADLINE_MS = 12000;
const MAX_FEATURES = 50;
const MAX_PIXELS = 4096;
const INFO_FORMATS = new Set(['text/xml', 'text/html', 'application/vnd.ogc.gml', 'text/plain']);

export interface FeatureInfoResult {
  contentType: string;
  body: string;
}

const int = (value: string | null, min: number, max: number): number | undefined => {
  if (value === null || !/^\d{1,5}$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
};

/** A WMS that may be queried and the layer names it may be asked about. */
export interface QueryTarget {
  url: string;
  layers: ReadonlySet<string>;
}

/** Overlays of our registry; other layers (the geoportal catalog) come from the caller's lookup. */
export function registryTarget(serviceId: string): QueryTarget | undefined {
  const def = OVERLAY_BY_ID.get(serviceId);
  return def ? { url: def.url, layers: new Set(def.sublayers.map((l) => l.name)) } : undefined;
}

/** Validated WMS 1.3.0 GetFeatureInfo parameters for one known service. */
function buildParams(def: QueryTarget | undefined, query: URLSearchParams): { url: string } {
  if (!def) throw new RequestError('Unknown service');

  const known = def.layers;
  const layers = (query.get('QUERY_LAYERS') ?? '').split(',').filter(Boolean);
  if (layers.length === 0 || layers.length > known.size || !layers.every((l) => known.has(l))) {
    throw new RequestError('Invalid QUERY_LAYERS');
  }

  const bbox = (query.get('BBOX') ?? '').split(',').map(Number);
  if (bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new RequestError('Invalid BBOX');

  const width = int(query.get('WIDTH'), 1, MAX_PIXELS);
  const height = int(query.get('HEIGHT'), 1, MAX_PIXELS);
  const i = int(query.get('I'), 0, MAX_PIXELS);
  const j = int(query.get('J'), 0, MAX_PIXELS);
  if (width === undefined || height === undefined || i === undefined || j === undefined) {
    throw new RequestError('Invalid WIDTH, HEIGHT, I or J');
  }

  const infoFormat = query.get('INFO_FORMAT') ?? 'text/html';
  if (!INFO_FORMATS.has(infoFormat)) throw new RequestError('Invalid INFO_FORMAT');
  const featureCount = int(query.get('FEATURE_COUNT'), 1, MAX_FEATURES) ?? 10;

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetFeatureInfo',
    VERSION: '1.3.0',
    CRS: 'EPSG:2180',
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
  return { url: serviceUrl(def.url, params) };
}

/** Where a request or redirect is allowed to go: public web hosts on web ports, nothing else. */
const allowedTarget = (location: string, from: string) => publicWebUrl(location, from);

export async function featureInfo(
  serviceId: string,
  query: URLSearchParams,
  lookup: (id: string) => QueryTarget | undefined = registryTarget,
): Promise<FeatureInfoResult> {
  let { url } = buildParams(lookup(serviceId), query);
  const signal = AbortSignal.timeout(DEADLINE_MS);
  // Catalog addresses come from the geoportal configuration: checked like redirects.
  if (!(await allowedTarget(url, url))) throw new Error('Address not allowed');

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      const next = await allowedTarget(location, url);
      if (!next) break;
      url = next.toString();
      continue;
    }
    const contentType = res.headers.get('content-type') ?? 'text/plain';
    const bytes = await readLimited(res, MAX_BYTES);
    if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
    const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
    let body: string;
    try {
      body = new TextDecoder(charset).decode(bytes);
    } catch {
      body = new TextDecoder().decode(bytes);
    }
    return { contentType: contentType.split(';')[0].trim().slice(0, 100), body };
  }
  throw new Error('Redirect chain rejected');
}
