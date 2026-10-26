import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Map from 'ol/Map';
import View from 'ol/View';
import ImageLayer from 'ol/layer/Image';
import ImageWMS from 'ol/source/ImageWMS';
import { PROJECTION, scaleToResolution } from './projection';
import { attachTimeTravel, timeLayerDrawsAt } from './timeTravel';
import { registerMeta } from '@/services/meta';
import { useMapStore } from '@/state/store';

let map: Map;
let detach: () => void;

/** The map's layer of the archival orthophoto map (map.yaml: timeTravel). */
const timeLayer = () =>
  map
    .getLayers()
    .getArray()
    .find((l): l is ImageLayer<ImageWMS> => l instanceof ImageLayer && l.getSource() instanceof ImageWMS)!;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  registerMeta('orto-archiwalna', {
    kind: 'wms',
    fetchedAt: '',
    title: '',
    infoFormats: [],
    layers: {
      Raster: { title: 'Raster', queryable: false, maxScale: 47247, dimensions: { time: { values: '1995-01-01/2025-11-01/P1M' } } },
    },
  });
  useMapStore.setState({ tool: 'none', time: null, timeStatus: 'idle', focus: null });
  map = new Map({
    target: document.createElement('div'),
    view: new View({ projection: PROJECTION, center: [600000, 500000], resolution: scaleToResolution(10000) }),
    controls: [],
    interactions: [],
  });
  map.setSize([800, 600]);
  detach = attachTimeTravel(map);
});

afterEach(() => {
  detach();
  map.setTarget(undefined);
});

describe('attachTimeTravel', () => {
  it('draws the layer only in the time view, as JPEG, at the chosen date', () => {
    const layer = timeLayer();
    expect(layer.getVisible()).toBe(false);
    expect(layer.getZIndex()).toBe(5);
    useMapStore.getState().setTool('time');
    expect(layer.getVisible()).toBe(true);
    const params = layer.getSource()!.getParams();
    expect(params).toMatchObject({ LAYERS: 'Raster', FORMAT: 'image/jpeg', TRANSPARENT: false, TIME: '2025-11-01' });
    useMapStore.getState().setTime('2007-01-01');
    expect(layer.getSource()!.getParams().TIME).toBe('2007-01-01');
    useMapStore.getState().setTool('none');
    expect(layer.getVisible()).toBe(false);
  });

  it('keeps to the scales the service draws at', () => {
    const layer = timeLayer();
    expect(layer.getMaxResolution()).toBeCloseTo(scaleToResolution(47247), 6);
    expect(timeLayerDrawsAt(10000)).toBe(true);
    expect(timeLayerDrawsAt(100000)).toBe(false);
  });

  it('zooms in when the view opens too far out for the layer', () => {
    useMapStore.getState().setTool('time');
    expect(useMapStore.getState().focus).toBeNull();
    useMapStore.getState().setTool('none');
    map.getView().setResolution(scaleToResolution(500000));
    useMapStore.getState().setTool('time');
    expect(useMapStore.getState().focus?.scale).toBe(20000);
  });

  it('reports the loading of the image, fading the last one meanwhile, and asks for it again on a retry', () => {
    const layer = timeLayer();
    const source = layer.getSource()!;
    expect((source as unknown as { ratio_: number }).ratio_).toBe(1);
    useMapStore.getState().setTool('time');
    source.dispatchEvent('imageloadstart');
    expect(useMapStore.getState().timeStatus).toBe('loading');
    expect(layer.getOpacity()).toBe(0.5);
    source.dispatchEvent('imageloaderror');
    expect(useMapStore.getState().timeStatus).toBe('error');
    const refresh = vi.spyOn(source, 'refresh');
    useMapStore.getState().retryTime();
    expect(refresh).toHaveBeenCalled();
    source.dispatchEvent('imageloadend');
    expect(useMapStore.getState().timeStatus).toBe('idle');
    expect(layer.getOpacity()).toBe(1);
  });

  it('goes with the map', () => {
    detach();
    expect(
      map
        .getLayers()
        .getArray()
        .some((l) => l instanceof ImageLayer),
    ).toBe(false);
    detach = () => {};
  });
});
