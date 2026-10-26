import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Map from 'ol/Map';
import View from 'ol/View';
import ImageLayer from 'ol/layer/Image';
import ImageWMS from 'ol/source/ImageWMS';
import RenderEvent from 'ol/render/Event';
import { PROJECTION } from './projection';
import { attachCurtain } from './curtain';
import { consumeMapClick } from '@/state/mapMenu';
import { useMapStore } from '@/state/store';

let map: Map;
let layer: ImageLayer<ImageWMS>;
let detach: () => void;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  useMapStore.setState({ tool: 'time', time: '2007-01-01', compare: true, curtain: 0.5 });
  const target = document.createElement('div');
  document.body.append(target);
  map = new Map({
    target,
    view: new View({ projection: PROJECTION, center: [600000, 500000], resolution: 10 }),
    controls: [],
    interactions: [],
  });
  map.setSize([800, 600]);
  vi.spyOn(viewport(), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600));
  layer = new ImageLayer({ source: new ImageWMS({ url: 'https://example.org/wms', params: { LAYERS: 'a' } }) });
  map.addLayer(layer);
  detach = attachCurtain(map, layer);
});

afterEach(() => {
  detach();
  map.setTarget(undefined);
  useMapStore.setState({ tool: 'none', compare: false, curtain: 0.5 });
});

const viewport = () => map.getViewport()!;
const handle = () => viewport().querySelector<HTMLElement>('.curtain-handle')!;
const root = () => viewport().querySelector<HTMLElement>('.curtain')!;

/** A render event of the layer with a 2D context whose clip calls are recorded. */
function render(type: 'prerender' | 'postrender') {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
  };
  // The canvas is the map's size: the identity transform maps map pixels onto it.
  const event = new RenderEvent(
    type,
    [1, 0, 0, 1, 0, 0],
    { pixelRatio: 1, size: [800, 600] } as never,
    ctx as unknown as CanvasRenderingContext2D,
  );
  layer.dispatchEvent(event);
  return ctx;
}

describe('attachCurtain', () => {
  it('shows the line where the curtain is, with the date on the left and today on the right', () => {
    expect(root().hidden).toBe(false);
    expect(viewport().querySelector('.curtain-line')!.getAttribute('style')).toContain('left: 50%');
    expect(viewport().querySelector('.curtain-label-left')!.textContent).toBe('01.01.2007');
    expect(viewport().querySelector('.curtain-label-right')!.textContent).toBe('Dziś');
    expect(handle().getAttribute('aria-valuenow')).toBe('50');
    useMapStore.getState().setCompare(false);
    expect(root().hidden).toBe(true);
  });

  it('clips the layer to the left of the curtain while comparing, and leaves it whole otherwise', () => {
    useMapStore.setState({ curtain: 0.25 });
    const ctx = render('prerender');
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(0, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(200, 0);
    expect(ctx.lineTo).toHaveBeenCalledWith(200, 600);
    expect(ctx.clip).toHaveBeenCalled();
    expect(render('postrender').restore).toHaveBeenCalled();
    useMapStore.getState().setCompare(false);
    expect(render('prerender').clip).not.toHaveBeenCalled();
    expect(render('postrender').restore).not.toHaveBeenCalled();
  });

  it('moves with the arrow keys and to a click on its track, which is no click on the map', () => {
    handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(useMapStore.getState().curtain).toBeCloseTo(0.55);
    handle().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(useMapStore.getState().curtain).toBe(0);
    const track = viewport().querySelector<HTMLElement>('.curtain-track')!;
    track.dispatchEvent(new MouseEvent('click', { clientX: 600, bubbles: true }));
    expect(useMapStore.getState().curtain).toBeCloseTo(0.75);
    expect(document.activeElement).toBe(handle());
    expect(consumeMapClick()).toBe(true);
    expect(consumeMapClick()).toBe(false);
  });

  it('drags with the pointer and keeps the press from the map', () => {
    const h = handle();
    h.setPointerCapture = vi.fn();
    const down = new PointerEvent('pointerdown', { clientX: 400, button: 0, pointerId: 1, bubbles: true, cancelable: true });
    const stop = vi.spyOn(down, 'stopPropagation');
    h.dispatchEvent(down);
    expect(stop).toHaveBeenCalled();
    h.dispatchEvent(new PointerEvent('pointermove', { clientX: 160, pointerId: 1, bubbles: true }));
    expect(useMapStore.getState().curtain).toBeCloseTo(0.2);
    h.dispatchEvent(new PointerEvent('pointerup', { clientX: 160, pointerId: 1, bubbles: true }));
    h.dispatchEvent(new PointerEvent('pointermove', { clientX: 700, pointerId: 1, bubbles: true }));
    expect(useMapStore.getState().curtain).toBeCloseTo(0.2);
  });

  it('goes with the layer', () => {
    detach();
    expect(viewport().querySelector('.curtain')).toBeNull();
    detach = () => {};
  });
});
