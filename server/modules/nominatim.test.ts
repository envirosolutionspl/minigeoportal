import { describe, expect, it, vi } from 'vitest';
import { nominatimSearch } from './nominatim.ts';

const ROW = {
  display_name: 'Pałac Kultury i Nauki, Śródmieście, Warszawa, Polska',
  lat: '52.2318',
  lon: '21.0067',
  boundingbox: ['52.2305', '52.2330', '21.0045', '21.0090'],
  addresstype: 'building',
};

const stub = () => {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify([ROW])));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

describe('nominatimSearch', () => {
  it('asks with the app named, in the language given, and passes on places in WGS 84', async () => {
    const fetch = stub();
    const search = nominatimSearch({ url: 'https://nominatim.example/', userAgent: 'test-app/1', countryCodes: ['pl'], intervalMs: 0 });
    expect(await search(' Pałac Kultury ', 'pl')).toEqual([
      { label: ROW.display_name, point: [21.0067, 52.2318], bbox: [21.0045, 52.2305, 21.009, 52.233], type: 'building' },
    ]);
    const [url, init] = fetch.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(url.startsWith('https://nominatim.example/search?')).toBe(true);
    expect([params.get('q'), params.get('accept-language'), params.get('countrycodes')]).toEqual(['Pałac Kultury', 'pl', 'pl']);
    expect(new Headers(init!.headers).get('user-agent')).toBe('test-app/1');
  });

  it('answers a repeated search from memory', async () => {
    const fetch = stub();
    const search = nominatimSearch({ url: 'https://nominatim.example', userAgent: 'a', intervalMs: 0 });
    await search('Warszawa', 'pl');
    await search('warszawa', 'pl');
    expect(fetch).toHaveBeenCalledTimes(1);
    await search('warszawa', 'en');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sends at most one request per interval and turns away a long queue', async () => {
    vi.useFakeTimers();
    try {
      const fetch = stub();
      const search = nominatimSearch({ url: 'https://nominatim.example', userAgent: 'a', intervalMs: 1000 });
      const answers = Array.from({ length: 25 }, (_, i) => search(`miejsce ${i}`, 'pl'));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(30000);
      const results = await Promise.all(answers);
      expect(results.filter((r) => r === undefined)).toHaveLength(5);
      expect(fetch).toHaveBeenCalledTimes(20);
    } finally {
      vi.useRealTimers();
    }
  });
});
