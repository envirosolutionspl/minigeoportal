import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Map from 'ol/Map';
import View from 'ol/View';
import { PROJECTION } from './projection';
import { attachContextMenu, LONG_PRESS_MS } from './contextMenu';
import { useMapMenu } from '@/state/mapMenu';
import { useMapStore } from '@/state/store';

let map: Map;
let target: HTMLDivElement;
let detach: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  // The map watches its target's size; jsdom has no ResizeObserver.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  target = document.createElement('div');
  document.body.append(target);
  map = new Map({
    target,
    view: new View({ projection: PROJECTION, center: [600000, 500000], resolution: 10 }),
    controls: [],
    interactions: [],
  });
  map.setSize([800, 600]);
  map.renderSync();
  // jsdom lays nothing out: the map fills the window from its top left corner.
  vi.spyOn(viewport(), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600));
  detach = attachContextMenu(map);
  useMapStore.setState({ tool: 'none' });
  useMapMenu.getState().close();
});

afterEach(() => {
  detach();
  map.setTarget(undefined);
  target.remove();
  vi.useRealTimers();
});

/** OpenLayers' own element inside the target, where pointers and clicks land. */
const viewport = () => map.getViewport() as HTMLElement;

const pointer = (type: string, x: number, y: number, id = 1, pointerType = 'touch') =>
  new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, pointerType, bubbles: true });

describe('context menu of the map', () => {
  it('opens on a right click where it was made, instead of the browser menu', () => {
    const e = new MouseEvent('contextmenu', { clientX: 500, clientY: 300, bubbles: true, cancelable: true });
    viewport().dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    const at = useMapMenu.getState().at!;
    expect(at.pixel).toEqual([500, 300]);
    // 100 px right of the centre at 10 m a pixel.
    expect(at.coordinate[0]).toBeCloseTo(601000);
    expect(at.coordinate[1]).toBeCloseTo(500000);
  });

  it('opens on a finger held still, and remembers that the release is not a click', () => {
    viewport().dispatchEvent(pointer('pointerdown', 400, 300));
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(useMapMenu.getState().at).toBeNull();
    vi.advanceTimersByTime(1);
    const [x, y] = useMapMenu.getState().at!.coordinate;
    expect(x).toBeCloseTo(600000);
    expect(y).toBeCloseTo(500000);
    expect(useMapMenu.getState().pressOpened).toBe(true);
  });

  it('keeps holding while a mouse moves or lets go elsewhere', () => {
    viewport().dispatchEvent(pointer('pointerdown', 400, 300, 1));
    document.dispatchEvent(pointer('pointermove', 50, 50, 2, 'mouse'));
    document.dispatchEvent(pointer('pointerup', 50, 50, 2, 'mouse'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(useMapMenu.getState().at).not.toBeNull();
  });

  it('does not open while the finger pans, two fingers pinch, or a mouse holds', () => {
    viewport().dispatchEvent(pointer('pointerdown', 400, 300));
    document.dispatchEvent(pointer('pointermove', 420, 300));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    document.dispatchEvent(pointer('pointerup', 420, 300));

    viewport().dispatchEvent(pointer('pointerdown', 400, 300, 1));
    viewport().dispatchEvent(pointer('pointerdown', 450, 300, 2));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    document.dispatchEvent(pointer('pointerup', 400, 300, 1));
    document.dispatchEvent(pointer('pointerup', 450, 300, 2));

    viewport().dispatchEvent(pointer('pointerdown', 400, 300, 3, 'mouse'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(useMapMenu.getState().at).toBeNull();
  });

  it('opens at the centre with the menu key on the focused map, once although the browser follows with its own event', () => {
    const key = new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true });
    target.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    expect(useMapMenu.getState().at).toMatchObject({ pixel: [400, 300], coordinate: [600000, 500000], byKeyboard: true });
    target.dispatchEvent(new MouseEvent('contextmenu', { clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    expect(useMapMenu.getState().at?.pixel).toEqual([400, 300]);
  });

  it('stays shut while a tool uses the map, and closes when the map moves', () => {
    useMapStore.setState({ tool: 'measure-line' });
    viewport().dispatchEvent(new MouseEvent('contextmenu', { clientX: 500, clientY: 300, bubbles: true, cancelable: true }));
    expect(useMapMenu.getState().at).toBeNull();

    // The time view does not use the clicks: the menu opens as usual.
    useMapStore.setState({ tool: 'time' });
    viewport().dispatchEvent(new MouseEvent('contextmenu', { clientX: 500, clientY: 300, bubbles: true, cancelable: true }));
    expect(useMapMenu.getState().at).not.toBeNull();
    map.dispatchEvent('movestart');
    expect(useMapMenu.getState().at).toBeNull();
  });
});
