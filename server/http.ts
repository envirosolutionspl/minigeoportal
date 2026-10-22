import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { Context, MiddlewareHandler } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';

/** Shared HTTP helpers: bounded upstream reads, private-network checks and rate limiting. */

/** A client mistake (bad parameter, unknown code): answered with 400 and this message. */
export class RequestError extends Error {}

/** Reads at most `maxBytes` of a response body; a longer body is cut, not buffered. */
export async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'));
  if (declared > maxBytes) {
    await res.body?.cancel();
    throw new Error('Upstream response too large');
  }
  if (!res.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await reader.cancel();
  const out = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, out.length - offset);
    out.set(part, offset);
    offset += part.length;
    if (offset >= out.length) break;
  }
  return out;
}

/**
 * Addresses a redirect must never lead to: loopback, private, link-local, carrier NAT,
 * unspecified. IPv4-mapped IPv6 addresses are matched against the IPv4 rules by Node itself.
 */
const PRIVATE = new BlockList();
for (const [net, prefix, family] of [
  ['0.0.0.0', 8, 'ipv4'],
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['::', 128, 'ipv6'],
  ['::1', 128, 'ipv6'],
  ['64:ff9b::', 96, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
] as const) {
  PRIVATE.addSubnet(net, prefix, family);
}

const isPrivateAddress = (address: string) => {
  const family = isIP(address);
  return family === 0 || PRIVATE.check(address, family === 6 ? 'ipv6' : 'ipv4');
};

/**
 * True when every address the host resolves to is public. Resolving here closes the gap
 * between a public-looking name and a private address behind it; a change of record
 * between this check and the request (DNS rebinding) is the one case left open.
 */
export async function isPublicHost(hostname: string): Promise<boolean> {
  const literal = hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal)) return !isPrivateAddress(literal);
  try {
    const addresses = await lookup(hostname, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** Ports of web servers; anything else (databases, admin consoles) is never contacted. */
const WEB_PORTS = new Set(['', '80', '443', '8080', '8443']);

/**
 * The address resolved against `base` if it is a public web server: http(s), a web port and a
 * host that resolves only to public addresses. Service addresses come from outside (the
 * geoportal configuration, redirects of county servers), so the server checks every one before
 * it connects, and cannot be made to reach its own network.
 */
export async function publicWebUrl(address: string, base?: string): Promise<URL | undefined> {
  let url: URL;
  try {
    url = new URL(address, base);
  } catch {
    return undefined;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !WEB_PORTS.has(url.port)) return undefined;
  return (await isPublicHost(url.hostname)) ? url : undefined;
}

/** fetch() that checks the address and every redirect with publicWebUrl. */
export async function fetchPublic(address: string, init: RequestInit = {}, maxRedirects = 5): Promise<Response> {
  let url = address;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const target = await publicWebUrl(url);
    if (!target) throw new Error('Address not allowed');
    const res = await fetch(target.href, { ...init, redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return res;
    await res.body?.cancel();
    url = new URL(location, target).toString();
  }
  throw new Error('Too many redirects');
}

/** Socket address of the request; empty outside the Node server (e.g. in tests without a socket). */
function remoteAddress(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? '';
  } catch {
    return '';
  }
}

/** Client address; the proxy header is honoured only when the deployment says a proxy sets it. */
export function clientAddress(c: Context): string {
  if (process.env.TRUSTED_PROXY === '1') {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return remoteAddress(c) || 'unknown';
}

export function isLoopback(c: Context): boolean {
  return !c.req.header('x-forwarded-for') && /^(127\.|::1$|::ffff:127\.)/.test(remoteAddress(c));
}

/**
 * Token bucket per client address: `burst` requests at once, refilled at `perMinute`.
 * In memory, so limits are per server process.
 */
export function rateLimit(burst: number, perMinute: number): MiddlewareHandler {
  const buckets = new Map<string, { tokens: number; at: number }>();
  const refillPerMs = perMinute / 60000;
  setInterval(() => {
    const stale = Date.now() - 10 * 60000;
    for (const [key, b] of buckets) if (b.at < stale) buckets.delete(key);
  }, 5 * 60000).unref();

  return async (c, next) => {
    const now = Date.now();
    const key = clientAddress(c);
    const b = buckets.get(key) ?? { tokens: burst, at: now };
    b.tokens = Math.min(burst, b.tokens + (now - b.at) * refillPerMs);
    b.at = now;
    if (b.tokens < 1) {
      buckets.set(key, b);
      c.header('Retry-After', '10');
      return c.text('Za dużo zapytań, spróbuj za chwilę.', 429);
    }
    b.tokens -= 1;
    buckets.set(key, b);
    await next();
  };
}

/** At most `max` tasks run at once; the rest are refused instead of queued. */
export function concurrencyGate(max: number) {
  let active = 0;
  return async <T>(task: () => Promise<T>): Promise<T | undefined> => {
    if (active >= max) return undefined;
    active++;
    try {
      return await task();
    } finally {
      active--;
    }
  };
}

/**
 * A service URL with request parameters added. Some services carry their own parameters in the
 * address (e.g. MapServer's `?map=...`) or end with a bare `?`; those are kept, and parameters
 * given here replace any of the same name, case-insensitively, as OGC parameter names are.
 */
export function serviceUrl(base: string, params: URLSearchParams | Record<string, string>): string {
  const url = new URL(base);
  const extra = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  for (const key of [...url.searchParams.keys()]) {
    if ([...extra.keys()].some((k) => k.toLowerCase() === key.toLowerCase())) url.searchParams.delete(key);
  }
  for (const [k, v] of extra) url.searchParams.append(k, v);
  return url.toString();
}
