import { describe, expect, it } from 'vitest';
import { heightsAt } from './elevation';
import { stubFetch } from '@/test/helpers';

const signal = new AbortController().signal;

describe('heightsAt', () => {
  it('asks the elevation model for a point northing first', async () => {
    const { calls } = stubFetch([['GetHByXY', '113.1']]);
    expect(await heightsAt([[637714, 485686]], signal)).toEqual([113.1]);
    expect(calls[0]).toBe('https://services.gugik.gov.pl/nmt/?request=GetHByXY&x=485686.00&y=637714.00');
  });

  it('asks for a list of points in one request and reads their heights in order; 0 is no height', async () => {
    const { calls } = stubFetch([['GetHByPointList', '485686.00 637714.00 113.1,485700.00 637800.00 0.0,485800.00 637900.00 -1.8']]);
    const heights = await heightsAt(
      [
        [637714, 485686],
        [637800, 485700],
        [637900, 485800],
      ],
      signal,
    );
    expect(heights).toEqual([113.1, null, -1.8]);
    expect(decodeURIComponent(calls[0])).toContain('list=485686.00 637714.00,485700.00 637800.00,485800.00 637900.00');
  });

  it('fails on an error of the service and asks nothing for no points', async () => {
    stubFetch([['nmt', 'down', { status: 503 }]]);
    await expect(heightsAt([[1, 2]], signal)).rejects.toThrow('HTTP 503');
    expect(await heightsAt([], signal)).toEqual([]);
  });
});
