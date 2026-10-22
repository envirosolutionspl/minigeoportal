import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
import { lookup } from 'node:dns/promises';
import { clientAddress, concurrencyGate, fetchPublic, isLoopback, isPublicHost, publicWebUrl, rateLimit, readLimited, serviceUrl } from './http.ts';

const resolveTo = (addresses: string[]) =>
  vi.mocked(lookup).mockResolvedValue(addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })) as never);

/** Request env the Node adapter would provide: a socket with a remote address. */
const socket = (remoteAddress: string) => ({ incoming: { socket: { remoteAddress, remoteFamily: 'IPv4', remotePort: 1 } } });

describe('readLimited', () => {
  it('reads a short body whole', async () => {
    const bytes = await readLimited(new Response('hello'), 100);
    expect(new TextDecoder().decode(bytes)).toBe('hello');
  });

  it('cuts a streamed body at the limit instead of buffering it', async () => {
    const chunk = new Uint8Array(1000).fill(65);
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(chunk);
      },
    });
    const bytes = await readLimited(new Response(stream), 2500);
    expect(bytes.length).toBe(2500);
  });

  it('rejects a declared length above the limit before reading', async () => {
    const res = new Response('x', { headers: { 'content-length': '5000000' } });
    await expect(readLimited(res, 1000)).rejects.toThrow(/too large/);
  });
});

describe('isPublicHost', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '[::1]', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1'])(
    'blocks the private literal %s',
    async (host) => {
      expect(await isPublicHost(host)).toBe(false);
    },
  );

  it('allows a public literal', async () => {
    expect(await isPublicHost('8.8.8.8')).toBe(true);
  });

  it('blocks a name that resolves to a private address, even partly', async () => {
    resolveTo(['93.184.216.34', '10.0.0.5']);
    expect(await isPublicHost('evil.example')).toBe(false);
  });

  it('allows a name that resolves only to public addresses', async () => {
    resolveTo(['93.184.216.34']);
    expect(await isPublicHost('wms.example')).toBe(true);
  });

  it('blocks a name that does not resolve', async () => {
    vi.mocked(lookup).mockRejectedValue(new Error('ENOTFOUND'));
    expect(await isPublicHost('nope.invalid')).toBe(false);
  });
});

describe('rateLimit', () => {
  it('allows the burst, then answers 429 until tokens refill', async () => {
    vi.useFakeTimers();
    const app = new Hono().use('*', rateLimit(2, 60)).get('/x', (c) => c.text('ok'));
    const env = socket('1.2.3.4');
    expect((await app.request('/x', {}, env)).status).toBe(200);
    expect((await app.request('/x', {}, env)).status).toBe(200);
    const limited = await app.request('/x', {}, env);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('10');
    // Another client has its own bucket.
    expect((await app.request('/x', {}, socket('5.6.7.8'))).status).toBe(200);
    vi.advanceTimersByTime(1500);
    expect((await app.request('/x', {}, env)).status).toBe(200);
    vi.useRealTimers();
  });

  it('keys IPv6 clients by their /64 and refuses new clients when the table is full', async () => {
    const app = new Hono().use('*', rateLimit(1, 60, 2)).get('/x', (c) => c.text('ok'));
    expect((await app.request('/x', {}, socket('2001:db8:1:2::1'))).status).toBe(200);
    // The same subscriber from another address in the /64 shares the bucket.
    expect((await app.request('/x', {}, socket('2001:db8:1:2:ffff::9'))).status).toBe(429);
    expect((await app.request('/x', {}, socket('2001:db8:1:3::1'))).status).toBe(200);
    // A third client finds no room until a bucket goes stale.
    expect((await app.request('/x', {}, socket('5.6.7.8'))).status).toBe(429);
  });
});

describe('clientAddress and isLoopback', () => {
  const probe = async (headers: Record<string, string>, env: unknown) => {
    const app = new Hono().get('/x', (c) => c.json({ address: clientAddress(c), loopback: isLoopback(c) }));
    return (await app.request('/x', { headers }, env)).json() as Promise<{ address: string; loopback: boolean }>;
  };

  it('uses the socket address and ignores a forwarded header by default', async () => {
    expect(await probe({ 'x-forwarded-for': '9.9.9.9' }, socket('1.2.3.4'))).toEqual({ address: '1.2.3.4', loopback: false });
  });

  it('honours the address the proxy appended (the last one) only with TRUSTED_PROXY, and then nothing is local', async () => {
    vi.stubEnv('TRUSTED_PROXY', '1');
    // The first entry is whatever the client wrote; the proxy appends the address it saw.
    expect((await probe({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }, socket('1.2.3.4'))).address).toBe('10.0.0.1');
    expect((await probe({}, socket('127.0.0.1'))).loopback).toBe(false);
  });

  it('treats a loopback socket without a proxy header as local', async () => {
    expect((await probe({}, socket('127.0.0.1'))).loopback).toBe(true);
    expect((await probe({ 'x-forwarded-for': '1.1.1.1' }, socket('127.0.0.1'))).loopback).toBe(false);
  });

  it('does not fail without a socket', async () => {
    expect(await probe({}, undefined)).toEqual({ address: 'unknown', loopback: false });
  });
});

describe('concurrencyGate', () => {
  it('refuses work above the limit and frees a slot when a task ends', async () => {
    const gate = concurrencyGate(1);
    let release!: () => void;
    const first = gate(() => new Promise<string>((r) => (release = () => r('first'))));
    expect(await gate(async () => 'second')).toBeUndefined();
    release();
    expect(await first).toBe('first');
    expect(await gate(async () => 'third')).toBe('third');
  });
});

describe('serviceUrl', () => {
  it('adds request parameters to addresses with their own parameters or a bare question mark', () => {
    expect(serviceUrl('https://a.example/wms', { SERVICE: 'WMS' })).toBe('https://a.example/wms?SERVICE=WMS');
    expect(serviceUrl('https://a.example/wms?', { SERVICE: 'WMS' })).toBe('https://a.example/wms?SERVICE=WMS');
    expect(serviceUrl('https://a.example/mapserv?map=/srv/x.map', { SERVICE: 'WMS' })).toBe('https://a.example/mapserv?map=%2Fsrv%2Fx.map&SERVICE=WMS');
  });

  it('replaces parameters of the same name whatever their case', () => {
    expect(serviceUrl('https://a.example/wms?service=WFS&request=GetCapabilities', { SERVICE: 'WMS', REQUEST: 'GetMap' })).toBe(
      'https://a.example/wms?SERVICE=WMS&REQUEST=GetMap',
    );
  });
});

describe('publicWebUrl and fetchPublic', () => {
  it('accepts public web servers only', async () => {
    resolveTo(['93.184.216.34']);
    expect((await publicWebUrl('https://a.example/wms'))?.href).toBe('https://a.example/wms');
    expect(await publicWebUrl('https://a.example:5432/db')).toBeUndefined();
    expect(await publicWebUrl('file:///etc/passwd')).toBeUndefined();
    expect(await publicWebUrl('not a url')).toBeUndefined();
    resolveTo(['10.1.2.3']);
    expect(await publicWebUrl('https://intranet.example/')).toBeUndefined();
  });

  it('checks every redirect and stops at one into a private network', async () => {
    vi.mocked(lookup).mockImplementation((async (host: string) =>
      host === 'inside.example' ? [{ address: '192.168.0.2', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]) as never);
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return url.includes('a.example') ? new Response(null, { status: 302, headers: { location: 'https://inside.example/x' } }) : new Response('x');
      }),
    );
    await expect(fetchPublic('https://a.example/caps')).rejects.toThrow('Redirect chain rejected');
    expect(calls).toEqual(['https://a.example/caps']);
  });
});
