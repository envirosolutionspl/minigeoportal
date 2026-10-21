import { OVERLAY_BY_ID } from '../src/services/registry.ts';
import { RequestError, isPublicHost, readLimited } from './http.ts';

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
const PORTS = new Set(['', '80', '443', '8080', '8443']);

export interface FeatureInfoResult {
  contentType: string;
  body: string;
}

const int = (value: string | null, min: number, max: number): number | undefined => {
  if (value === null || !/^\d{1,5}$/.test(value)) return undefined;
  const n = Number(value);
  return n >= min && n <= max ? n : undefined;
};

/** Validated WMS 1.3.0 GetFeatureInfo parameters for one registered overlay. */
function buildParams(serviceId: string, query: URLSearchParams): { url: string } {
  const def = OVERLAY_BY_ID.get(serviceId);
  if (!def) throw new RequestError('Unknown service');

  const known = new Set(def.sublayers.map((l) => l.name));
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
  return { url: `${def.url}?${params}` };
}

/** Where a redirect is allowed to go: public web hosts on web ports, nothing else. */
async function allowedTarget(location: string, from: string): Promise<URL | undefined> {
  const next = new URL(location, from);
  if ((next.protocol !== 'https:' && next.protocol !== 'http:') || !PORTS.has(next.port)) return undefined;
  if (!(await isPublicHost(next.hostname))) return undefined;
  return next;
}

export async function featureInfo(serviceId: string, query: URLSearchParams): Promise<FeatureInfoResult> {
  let { url } = buildParams(serviceId, query);
  const signal = AbortSignal.timeout(DEADLINE_MS);

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
