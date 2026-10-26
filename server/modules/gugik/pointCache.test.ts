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
