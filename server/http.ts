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
