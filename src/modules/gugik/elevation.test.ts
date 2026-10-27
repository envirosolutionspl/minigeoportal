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

  it('asks again while every answer is 0, which the service now and then gives where it has data', async () => {
    const { fetchMock } = stubFetch([['GetHByPointList', '1 2 0.0,3 4 0.0']]);
    fetchMock.mockResolvedValueOnce(new Response('1 2 0.0,3 4 0.0')).mockResolvedValueOnce(new Response('1 2 1428.3,3 4 1435.9'));
    const points: [number, number][] = [
      [2, 1],
      [4, 3],
    ];
    expect(await heightsAt(points, signal)).toEqual([1428.3, 1435.9]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Where the model has no data at all, three answers of 0 are none.
    expect(await heightsAt(points, signal)).toEqual([null, null]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('fails on an error of the service and asks nothing for no points', async () => {
    stubFetch([['nmt', 'down', { status: 503 }]]);
    await expect(heightsAt([[1, 2]], signal)).rejects.toThrow('HTTP 503');
    expect(await heightsAt([], signal)).toEqual([]);
  });
});
