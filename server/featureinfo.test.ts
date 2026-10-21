import { describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
import { lookup } from 'node:dns/promises';
import { featureInfo } from './featureinfo.ts';
import { RequestError } from './http.ts';

const KIEG = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow';
const VALID = 'QUERY_LAYERS=dzialki&BBOX=482449,656835,482475,656861&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=text/xml';
const query = (q: string) => new URLSearchParams(q);

/** fetch stub: each entry answers one hop; `calls` records the URLs in order. */
function stubHops(hops: (() => Response)[]) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const next = hops.shift();
      return next ? next() : new Response('no more hops', { status: 500 });
    }),
  );
  return calls;
}
const redirect = (location: string) => () => new Response(null, { status: 302, headers: { location } });
const ok = (body: string, type = 'text/xml') => () => new Response(body, { status: 200, headers: { 'content-type': type } });

describe('featureInfo validation', () => {
  it.each([
    ['evil', VALID, 'Unknown service'],
    ['kieg', VALID.replace('dzialki', 'foo'), 'Invalid QUERY_LAYERS'],
    ['kieg', VALID.replace('QUERY_LAYERS=dzialki', 'QUERY_LAYERS='), 'Invalid QUERY_LAYERS'],
    ['kieg', VALID.replace('482475,656861', '482475'), 'Invalid BBOX'],
    ['kieg', VALID.replace('WIDTH=101', 'WIDTH=99999'), 'Invalid WIDTH, HEIGHT, I or J'],
    ['kieg', VALID.replace('I=50', 'I=-1'), 'Invalid WIDTH, HEIGHT, I or J'],
    ['kieg', VALID.replace('text/xml', 'text/evil'), 'Invalid INFO_FORMAT'],
  ])('rejects %s?%s with "%s"', async (service, q, message) => {
    stubHops([]);
    await expect(featureInfo(service, query(q))).rejects.toThrow(new RequestError(message));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rebuilds the upstream request from validated values only', async () => {
    const calls = stubHops([ok('<x/>')]);
    await featureInfo('kieg', query(`${VALID}&FEATURE_COUNT=99999&REQUEST=GetMap&SERVICE=WFS&EXTRA=1`));
    const url = new URL(calls[0]);
    expect(url.origin + url.pathname).toBe(KIEG);
    expect(url.searchParams.get('REQUEST')).toBe('GetFeatureInfo');
    expect(url.searchParams.get('SERVICE')).toBe('WMS');
    expect(url.searchParams.get('CRS')).toBe('EPSG:2180');
    expect(url.searchParams.get('LAYERS')).toBe('dzialki');
    expect(url.searchParams.get('FEATURE_COUNT')).toBe('10');
    expect(url.searchParams.has('EXTRA')).toBe(false);
  });
});

describe('featureInfo redirects', () => {
  it('follows redirects to public hosts and returns the final body and type', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const calls = stubHops([
      redirect('https://integracja01.gugik.gov.pl/cgi-bin/x?a=1'),
      redirect('https://powiat-otwocki.geoportal2.pl/map/wmse.php?b=2'),
      ok('<?xml version="1.0"?><F/>', 'text/xml; charset=utf-8'),
    ]);
    const result = await featureInfo('kieg', query(VALID));
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain('powiat-otwocki.geoportal2.pl');
    expect(result).toEqual({ contentType: 'text/xml', body: '<?xml version="1.0"?><F/>' });
  });

  it('stops at a redirect to a private address', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);
    const calls = stubHops([redirect('https://internal.example/admin'), ok('secret')]);
    await expect(featureInfo('kieg', query(VALID))).rejects.toThrow(/Redirect chain rejected/);
    expect(calls).toHaveLength(1);
  });

  it.each(['ftp://x.example/', 'https://x.example:8000/', 'file:///etc/passwd'])('stops at %s', async (location) => {
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const calls = stubHops([redirect(location), ok('x')]);
    await expect(featureInfo('kieg', query(VALID))).rejects.toThrow(/Redirect chain rejected/);
    expect(calls).toHaveLength(1);
  });

  it('gives up after too many redirects', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    const calls = stubHops(Array.from({ length: 8 }, (_, i) => redirect(`https://h${i}.example/`)));
    await expect(featureInfo('kieg', query(VALID))).rejects.toThrow(/Redirect chain rejected/);
    expect(calls).toHaveLength(6);
  });

  it('reports upstream errors without exposing the body', async () => {
    stubHops([() => new Response('internal details', { status: 500 })]);
    await expect(featureInfo('kieg', query(VALID))).rejects.toThrow('Upstream HTTP 500');
  });

  it('decodes the declared charset and falls back to utf-8 for an unknown one', async () => {
    const latin2 = new Uint8Array([0xb3, 0xb1]); // "łą" in ISO-8859-2
    stubHops([() => new Response(latin2, { headers: { 'content-type': 'text/html; charset=ISO-8859-2' } })]);
    expect((await featureInfo('kieg', query(VALID))).body).toBe('łą');
    stubHops([() => new Response('plain', { headers: { 'content-type': 'text/html; charset=x-unknown' } })]);
    expect((await featureInfo('kieg', query(VALID))).body).toBe('plain');
  });
});
