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
 * Addresses a request must never lead to: loopback, private, link-local, carrier NAT,
 * multicast, benchmark and other special ranges, and the IPv6 forms that embed them.
 * IPv4-mapped IPv6 addresses are matched against the IPv4 rules by Node itself.
 */
const PRIVATE = new BlockList();
for (const [net, prefix, family] of [
  ['0.0.0.0', 8, 'ipv4'],
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.0.0.0', 24, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['224.0.0.0', 3, 'ipv4'],
  ['::', 96, 'ipv6'],
  ['64:ff9b::', 96, 'ipv6'],
  ['64:ff9b:1::', 48, 'ipv6'],
  ['100::', 64, 'ipv6'],
  ['2002::', 16, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['fec0::', 10, 'ipv6'],
  ['ff00::', 8, 'ipv6'],
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
    if (!target) throw new Error(hop === 0 ? 'Address not allowed' : 'Redirect chain rejected');
    const res = await fetch(target.href, { ...init, redirect: 'manual' });
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return res;
    await res.body?.cancel();
    url = new URL(location, target).toString();
  }
  throw new Error('Too many redirects');
}

/**
 * fetch() of a fixed GUGiK address: no redirects, and a failed answer is dropped at once
 * instead of holding the connection until the body is collected.
 */
export async function fetchFixed(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, redirect: 'error' });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`HTTP ${res.status}`);
  }
  return res;
}

/** Socket address of the request; empty outside the Node server (e.g. in tests without a socket). */
function remoteAddress(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? '';
  } catch {
    return '';
  }
}

/** A proxy in front of the server (TRUSTED_PROXY=1) sets the client headers; see .env.example. */
const behindProxy = () => process.env.TRUSTED_PROXY === '1';

/**
 * Client address. Behind the proxy it is the last X-Forwarded-For entry: the one the proxy
 * itself appended. Earlier entries are whatever the client sent and are never trusted.
 */
export function clientAddress(c: Context): string {
  if (behindProxy()) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim();
    if (forwarded) return forwarded;
  }
  return remoteAddress(c) || 'unknown';
}

/**
 * A request from the server's own machine, for the refresh routes. Behind a proxy every
 * request arrives from the machine, so nothing counts as local there.
 */
export function isLoopback(c: Context): boolean {
  return !behindProxy() && !c.req.header('x-forwarded-for') && /^(127\.|::1$|::ffff:127\.)/.test(remoteAddress(c));
}

/**
 * Key of a client for rate limits: its address, with IPv6 cut to the /64 a subscriber
 * gets, so one subscriber cannot start a fresh bucket per address.
 */
export function rateKey(c: Context): string {
  const address = clientAddress(c).replace(/^::ffff:/i, '');
  if (isIP(address) !== 6) return address;
  const [head, tail = ''] = address.split('::');
  const first = head ? head.split(':') : [];
  const last = tail ? tail.split(':') : [];
  const groups = [...first, ...Array<string>(8 - first.length - last.length).fill('0'), ...last];
  return `${groups.slice(0, 4).map((g) => g.padStart(4, '0')).join(':')}::/64`;
}

/**
 * Token bucket per client: `burst` requests at once, refilled at `perMinute`. In memory, so
 * limits are per server process; at most `maxClients` buckets, so a flood of addresses cannot
 * grow memory without bound (new clients are refused while the table is full of recent ones).
 */
export function rateLimit(burst: number, perMinute: number, maxClients = 20000): MiddlewareHandler {
  const buckets = new Map<string, { tokens: number; at: number }>();
  const refillPerMs = perMinute / 60000;
  const sweep = (olderThanMs: number) => {
    const stale = Date.now() - olderThanMs;
    for (const [key, b] of buckets) if (b.at < stale) buckets.delete(key);
  };
  setInterval(() => sweep(10 * 60000), 5 * 60000).unref();
  const refuse = (c: Context) => {
    c.header('Retry-After', '10');
    return c.text('Za dużo zapytań, spróbuj za chwilę.', 429);
  };

  return async (c, next) => {
    const now = Date.now();
    const key = rateKey(c);
    let b = buckets.get(key);
    if (!b) {
      if (buckets.size >= maxClients) sweep(60000);
      if (buckets.size >= maxClients) return refuse(c);
      b = { tokens: burst, at: now };
      buckets.set(key, b);
    }
    b.tokens = Math.min(burst, b.tokens + (now - b.at) * refillPerMs);
    b.at = now;
    if (b.tokens < 1) return refuse(c);
    b.tokens -= 1;
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
