import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import Map from 'ol/Map';
import type View from 'ol/View';
import VectorLayer from 'ol/layer/Vector';
import { attachFocus } from './focus';
import { scaleToResolution } from './projection';
import { useMapStore, type FocusTarget } from '@/state/store';
import { testMap } from '@/test/helpers';

let map: Map;
let detach: () => void;
let detachMap: () => void;
let fit: MockInstance<View['fit']>;
let animate: MockInstance<View['animate']>;

beforeEach(() => {
  // The timers and the animation frames of the fade run on the fake clock. The map draws nothing
  // (jsdom has no canvas; the map's layers call the render of the prototype) and the view does
  // not move, only says where it was asked to.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  vi.spyOn(Map.prototype, 'render').mockImplementation(() => {});
  ({ map, detach: detachMap } = testMap());
  fit = vi.spyOn(map.getView(), 'fit').mockImplementation(() => {});
  animate = vi.spyOn(map.getView(), 'animate').mockImplementation(() => {});
  useMapStore.setState({ focus: null });
  detach = attachFocus(map);
});

afterEach(() => {
  detach();
  detachMap();
  vi.useRealTimers();
});

const layer = () =>
  map
    .getLayers()
    .getArray()
    .find((l): l is VectorLayer => l instanceof VectorLayer);
const outlines = () => layer()!.getSource()!.getFeatures();
const focusOn = (target: Omit<FocusTarget, 'seq'>) => useMapStore.getState().focusOn(target);
const SQUARE = 'POLYGON((600000 500000,600100 500000,600100 500100,600000 500100,600000 500000))';

describe('attachFocus', () => {
  it('outlines a geometry and fits the view to it; a point it marks and flies to', () => {
    focusOn({ wkt: SQUARE, zoom: 12 });
    expect(outlines()).toHaveLength(1);
    expect(fit).toHaveBeenCalledWith([600000, 500000, 600100, 500100], expect.objectContaining({ maxZoom: 12, duration: 700 }));

    focusOn({ center: [601000, 500000], zoom: 10 });
    expect(outlines()).toHaveLength(1);
    expect(outlines()[0].getGeometry()!.getType()).toBe('Point');
    expect(animate).toHaveBeenCalledWith(expect.objectContaining({ center: [601000, 500000], zoom: 10, duration: 600 }));
  });

  it('shows an area or a scale without touching the outline on the map', () => {
    focusOn({ wkt: SQUARE, persist: true, zoom: 12 });
    focusOn({ extent: [0, 0, 10, 10], zoom: 0 });
    expect(fit).toHaveBeenLastCalledWith([0, 0, 10, 10], expect.objectContaining({ duration: 700 }));
    focusOn({ scale: 5000, zoom: 0 });
    expect(animate).toHaveBeenCalledWith({ resolution: scaleToResolution(5000), duration: 500 });
    expect(outlines()).toHaveLength(1);
  });

  it('fades the outline out after 3.5 s, unless it is to stay', () => {
    focusOn({ center: [600000, 500000], zoom: 10 });
    vi.advanceTimersByTime(3500);
    expect(outlines()).toHaveLength(1);
    vi.advanceTimersByTime(450);
    expect(layer()!.getOpacity()).toBeCloseTo(0.5, 1);
    vi.advanceTimersByTime(500);
    expect(outlines()).toHaveLength(0);

    focusOn({ wkt: SQUARE, persist: true, zoom: 12 });
    expect(layer()!.getOpacity()).toBe(1);
    vi.advanceTimersByTime(10000);
    expect(outlines()).toHaveLength(1);
  });

  it('clears the outline with the focus, and takes its layer off the map when detached', () => {
    focusOn({ wkt: SQUARE, persist: true, zoom: 12 });
    useMapStore.setState({ focus: null });
    expect(outlines()).toHaveLength(0);
    detach();
    expect(layer()).toBeUndefined();
  });
});
