import { afterEach, describe, expect, it, vi } from 'vitest';
import { pointCache } from './pointCache.ts';

afterEach(() => vi.useRealTimers());

describe('pointCache', () => {
  it('answers a point again from memory until the answer is old', async () => {
    vi.useFakeTimers();
    const cache = pointCache<number>(1000, 10);
    const load = vi.fn(async () => 1);
    expect(await cache('1,2', load)).toBe(1);
    expect(await cache('1,2', load)).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    await cache('1,2', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps no failure and no busy answer', async () => {
    const cache = pointCache<number>(1000, 10);
    await expect(cache('a', async () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(await cache('a', async () => undefined)).toBeUndefined();
    expect(await cache('a', async () => 3)).toBe(3);
  });

  it('asks upstream once for a point several visitors ask for at the same time', async () => {
    const cache = pointCache<number>(1000, 10);
    let answer!: (value: number) => void;
    const load = vi.fn(() => new Promise<number>((r) => (answer = r)));
    const first = cache('1,2', load);
    const second = cache('1,2', load);
    expect(load).toHaveBeenCalledTimes(1);
    answer(7);
    expect(await Promise.all([first, second])).toEqual([7, 7]);
    // Once answered, the point is served from memory; after a failure it is asked again.
    expect(await cache('1,2', load)).toBe(7);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(cache('3,4', async () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    expect(await cache('3,4', async () => 5)).toBe(5);
  });

  it('drops the oldest point when full', async () => {
    const cache = pointCache<string>(60000, 2);
    const load = vi.fn(async () => 'x');
    await cache('a', load);
    await cache('b', load);
    await cache('c', load);
    await cache('b', load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache('a', load);
    expect(load).toHaveBeenCalledTimes(4);
  });
});
