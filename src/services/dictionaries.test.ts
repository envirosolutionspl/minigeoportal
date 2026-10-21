import { describe, expect, it, vi } from 'vitest';
import { dictionary, parcelInPrecinct } from './dictionaries';
import { stubFetch } from '@/test/helpers';

describe('dictionary', () => {
  it('builds the URL without a trailing slash for the top level and remembers answers', async () => {
    const { calls } = stubFetch([['/api/dict/wojewodztwa', [{ id: '14', name: 'mazowieckie' }]], ['/api/dict/powiaty/14', [{ id: '1417', name: 'otwocki' }]]]);
    expect(await dictionary('wojewodztwa')).toEqual([{ id: '14', name: 'mazowieckie' }]);
    expect(await dictionary('wojewodztwa')).toHaveLength(1);
    expect(await dictionary('powiaty', '14')).toEqual([{ id: '1417', name: 'otwocki' }]);
    expect(calls).toEqual(['/api/dict/wojewodztwa', '/api/dict/powiaty/14']);
  });

  it('retries a failed request once, then forgets it so a later call tries again', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        attempts++;
        return attempts < 3 ? new Response('down', { status: 503 }) : new Response(JSON.stringify([{ id: '12', name: 'x' }]));
      }),
    );
    const first = dictionary('gminy', '1261').catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await first).toBe('HTTP 503');
    expect(attempts).toBe(2);
    expect(await dictionary('gminy', '1261')).toEqual([{ id: '12', name: 'x' }]);
    vi.useRealTimers();
  });
});

describe('parcelInPrecinct', () => {
  const precinct = { id: '141708_2.0021', name: 'Wiązowna Gminna' };
  const row = (id: string, region: string) => `1\n${id}|Wiązowna|${region}|22/1|SRID=2180;POINT(0 0)\n`;

  it('asks by precinct id first', async () => {
    const { calls } = stubFetch([['id=141708_2.0021.22%2F1', row('141708_2.0021.22/1', 'Wiązowna Gminna')]]);
    const hits = await parcelInPrecinct(precinct, ' 22/1 ', new AbortController().signal);
    expect(hits).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });

  it('falls back to the precinct name and keeps only hits from that precinct', async () => {
    stubFetch([
      ['id=141708_2.0021.22%2F1', '-1 brak wyników'],
      ['id=Wi%C4%85zowna+Gminna+22%2F1', `2\n141708_2.0021.AR_1.22/1|Wiązowna|Wiązowna Gminna|22/1|SRID=2180;POINT(0 0)\n020101_1.0001.22/1|Inna|Wiązowna Gminna|22/1|SRID=2180;POINT(1 1)\n`],
    ]);
    const hits = await parcelInPrecinct(precinct, '22/1', new AbortController().signal);
    expect(hits).toHaveLength(1);
    expect(hits[0].detail).toContain('141708_2.0021.AR_1.22/1');
  });
});
