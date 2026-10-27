import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import ImageLayer from 'ol/layer/Image';
import ImageWMS from 'ol/source/ImageWMS';
import OlMap from 'ol/Map';
import type BaseLayer from 'ol/layer/Base';
import { MapView } from './MapView';
import { useMapStore } from '@/state/store';
import { withCapabilities } from '@/test/helpers';

/** Every layer the view adds to its map, in order. */
let added: BaseLayer[] = [];

beforeEach(async () => {
  await withCapabilities();
  added = [];
  const addLayer = OlMap.prototype.addLayer;
  vi.spyOn(OlMap.prototype, 'addLayer').mockImplementation(function (this: OlMap, layer: BaseLayer) {
    added.push(layer);
    return addLayer.call(this, layer);
  });
  useMapStore.setState({ base: 'orto', overlays: ['kieg', 'orto-archiwalna'], sublayers: {}, tool: 'none', time: null, compare: false });
});

afterEach(() => useMapStore.setState({ overlays: ['kieg'], tool: 'none' }));

/** The WMS image layers added so far. */
const wmsLayers = () => added.filter((l): l is ImageLayer<ImageWMS> => l instanceof ImageLayer && l.getSource() instanceof ImageWMS);

describe('MapView', () => {
  it('keeps the archival photo layer of the list off while the time view shows the same service at its date', () => {
    render(<MapView />);
    const archival = wmsLayers().filter((l) => l.getSource()!.getUrl()?.includes('StandardResolutionTime'));
    // The layer of the list and the layer of the time view draw the same service.
    expect(archival).toHaveLength(2);
    const [listed, viewed] = archival[0].getZIndex()! > archival[1].getZIndex()! ? archival : [archival[1], archival[0]];
    expect(listed.getVisible()).toBe(true);
    expect(viewed.getVisible()).toBe(false);
    act(() => useMapStore.getState().setTool('time'));
    expect(listed.getVisible()).toBe(false);
    expect(viewed.getVisible()).toBe(true);
    act(() => useMapStore.getState().setTool('none'));
    expect(listed.getVisible()).toBe(true);
  });
});
