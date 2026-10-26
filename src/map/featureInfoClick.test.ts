import { beforeEach, describe, expect, it } from 'vitest';
import { overlayById } from '@/config/runtime';
import type { OverlayLayer } from '@/services/layers';
import { useMapStore } from '@/state/store';
import { withCapabilities } from '@/test/helpers';
import { infoTargets } from './featureInfoClick';

/** The layer objects are not touched: any stand-in will do. */
const shown = (...ids: string[]) => ids.map((id) => ({ def: overlayById.get(id)!, layer: {} as OverlayLayer }));

beforeEach(async () => {
  await withCapabilities();
});

describe('infoTargets', () => {
  it('asks the overlays that are on, about their layers that answer at the scale', () => {
    useMapStore.setState({ overlays: ['kieg'], sublayers: {} });
    expect(infoTargets(shown('kieg', 'kimpzp'), 5000).map((t) => [t.def.id, t.layers])).toEqual([['kieg', ['dzialki']]]);
  });

  it('asks nobody while the map is zoomed out past every answering layer, so the place is asked about again after a zoom', () => {
    useMapStore.setState({ overlays: ['kieg'], sublayers: {} });
    expect(infoTargets(shown('kieg'), 47247)).toEqual([]);
    expect(infoTargets(shown('kieg'), 22500).map((t) => t.layers)).toEqual([['obreby']]);
  });
});
