import { OVERLAY_BY_ID } from '../src/services/registry.ts';

/**
 * GetFeatureInfo proxy. The browser cannot query integration services directly: they
 * redirect to county and city servers, and a CORS request that follows a cross-origin
 * redirect carries `Origin: null`, which some of those servers reject. The server follows
 * the redirects itself. Only registered services are reachable, with a fixed parameter set,
 * so this is not an open proxy.
 */

const ALLOWED = new Set([
  'VERSION',
  'LAYERS',
  'QUERY_LAYERS',
  'STYLES',
  'CRS',
  'BBOX',
  'WIDTH',
  'HEIGHT',
  'I',
  'J',
  'INFO_FORMAT',
  'FEATURE_COUNT',
  'FORMAT',
  'TRANSPARENT',
]);
const MAX_REDIRECTS = 5;
const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 12000;

/** Hostnames that must never be reached through a redirect. */
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|0\.)/i;

export interface FeatureInfoResult {
  status: number;
  contentType: string;
  body: string;
}

export async function featureInfo(serviceId: string, query: URLSearchParams): Promise<FeatureInfoResult> {
  const def = OVERLAY_BY_ID.get(serviceId);
  if (!def) return { status: 404, contentType: 'text/plain', body: 'Unknown service' };

  const params = new URLSearchParams({ SERVICE: 'WMS', REQUEST: 'GetFeatureInfo' });
  for (const [key, value] of query) {
    const k = key.toUpperCase();
    if (ALLOWED.has(k)) params.set(k, value);
  }
  if (!params.get('QUERY_LAYERS') || !params.get('BBOX')) {
    return { status: 400, contentType: 'text/plain', body: 'QUERY_LAYERS and BBOX are required' };
  }

  let url = `${def.url}?${params.toString()}`;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, url);
      if (next.protocol !== 'https:' && next.protocol !== 'http:') break;
      if (PRIVATE_HOST.test(next.hostname)) break;
      url = next.toString();
      continue;
    }
    const contentType = res.headers.get('content-type') ?? 'text/plain';
    const bytes = new Uint8Array(await res.arrayBuffer()).slice(0, MAX_BYTES);
    const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
    let body: string;
    try {
      body = new TextDecoder(charset).decode(bytes);
    } catch {
      body = new TextDecoder('utf-8').decode(bytes);
    }
    return { status: res.status, contentType: contentType.split(';')[0].trim(), body };
  }
  return { status: 502, contentType: 'text/plain', body: 'Too many or invalid redirects' };
}
