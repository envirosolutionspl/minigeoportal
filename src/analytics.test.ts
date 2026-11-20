import { afterEach, describe, expect, it, vi } from 'vitest';
import { track, watchStores } from './analytics';
import { useInfoStore } from '@/state/info';
import { useMapStore } from '@/state/store';

describe('analytics', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing without the tracker and never throws when it fails', () => {
    expect(() => track('search')).not.toThrow();
    vi.stubGlobal('umami', {
      track: () => {
        throw new Error('blocked');
      },
    });
    expect(() => track('search')).not.toThrow();
  });

  it('sends layers switched on, tools opened, parcels added and places clicked, not what was turned off', () => {
    const sent = vi.fn();
    vi.stubGlobal('umami', { track: sent });
    const initial = useMapStore.getState();
    const stop = watchStores();
    const map = useMapStore.getState();
    map.toggleOverlay('test-layer');
    map.toggleOverlay('test-layer');
    map.setTool('print');
    map.setTool('none');
    map.addParcel('146501_8.0101.1');
    useInfoStore.getState().start([1, 2], []);
    stop();
    map.setTool('profile');
    expect(sent.mock.calls).toEqual([
      ['layer', { id: 'test-layer' }],
      ['tool', { name: 'print' }],
      ['parcel', undefined],
      ['info', undefined],
    ]);
    useMapStore.setState(initial, true);
    useInfoStore.getState().close();
  });
});
