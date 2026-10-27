import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLoads, loadEnded, loadStarted } from './slow';
import { useStatusStore } from './status';

const slow = () => useStatusStore.getState().slow;
/** A tile or image in the given OpenLayers state (1: loading). */
const load = (state = 1) => ({
  state,
  getState() {
    return this.state;
  },
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  clearLoads();
  vi.useRealTimers();
});

describe('slow loads', () => {
  it('names a layer once its data waits past map.yaml slowLoad (8 s), and lets it go when it arrives', () => {
    const tile = load();
    loadStarted('kieg', tile);
    vi.advanceTimersByTime(7000);
    expect(slow()).toEqual([]);
    vi.advanceTimersByTime(1500);
    expect(slow()).toEqual(['kieg']);
    loadEnded('kieg', tile);
    expect(slow()).toEqual([]);
  });

  it('keeps a layer slow while any of its loads waits, and the order the layers became slow in', () => {
    const first = load();
    const second = load();
    loadStarted('kimpzp', first);
    vi.advanceTimersByTime(3000);
    loadStarted('kieg', load());
    loadStarted('kimpzp', second);
    vi.advanceTimersByTime(6000);
    expect(slow()).toEqual(['kimpzp']);
    vi.advanceTimersByTime(3000);
    expect(slow()).toEqual(['kimpzp', 'kieg']);
    loadEnded('kimpzp', first);
    expect(slow()).toEqual(['kimpzp', 'kieg']);
    loadEnded('kimpzp', second);
    expect(slow()).toEqual(['kieg']);
  });

  it('lets go of a load OpenLayers dropped without a word, as when the view moves on', () => {
    const tile = load();
    loadStarted('kieg', tile);
    vi.advanceTimersByTime(9000);
    expect(slow()).toEqual(['kieg']);
    tile.state = 5; // TileState.ABORT
    vi.advanceTimersByTime(1000);
    expect(slow()).toEqual([]);
  });
});
