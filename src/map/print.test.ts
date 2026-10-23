import { beforeEach, describe, expect, it, vi } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import { attachPrint, nearestPrintScale, printExtent, printLayout, serverScale } from './print';
import { PROJECTION } from './projection';
import { useMapStore } from '@/state/store';

describe('printLayout', () => {
  it('fits the map frame between margins, header and footer, and sets the resolution for the scale', () => {
    const a4 = printLayout({ paper: 'A4', orientation: 'landscape', scale: 1000 });
    expect(a4.page).toEqual([297, 210]);
    expect(a4.mapMm).toEqual([277, 140]);
    expect(a4.mapPx).toEqual([1662, 840]);
    // 1 mm on paper at 1:1000 is 1 m, drawn by 6 pixels.
    expect(a4.resolution).toBeCloseTo(1 / 6);
    // In Warsaw a metre of the national grid is 0.9985 m on the ground: the map shows a little more.
    expect(printLayout({ paper: 'A4', orientation: 'landscape', scale: 1000 }, [637000, 486980]).resolution).toBeCloseTo(1 / 6 / 0.9985, 4);
    // Map pixels shrink to their size on paper: 6 per millimetre.
    expect(a4.zoom * 6).toBeCloseTo(96 / 25.4);
    expect(printLayout({ paper: 'A3', orientation: 'portrait', scale: 1000 }).page).toEqual([297, 420]);
  });
});

describe('printExtent and serverScale', () => {
  it('gives the ground area of the frame and the scale a WMS server sees', () => {
    // A4 landscape frame is 277 × 140 mm: 2770 × 1400 m at 1:10 000.
    const extent = printExtent([637000, 486980], { paper: 'A4', orientation: 'landscape', scale: 10000 });
    expect((extent[2] - extent[0]) * 0.9985).toBeCloseTo(2770, 0);
    expect((extent[3] - extent[1]) * 0.9985).toBeCloseTo(1400, 0);
    expect((extent[0] + extent[2]) / 2).toBeCloseTo(637000, 6);
    expect(serverScale({ paper: 'A4', orientation: 'landscape', scale: 10000 })).toBeCloseTo(5952, 0);
  });
});

describe('nearestPrintScale', () => {
  it('picks the closest standard scale, 1:10 000 before the map reports one', () => {
    expect(nearestPrintScale(1890)).toBe(2000);
    expect(nearestPrintScale(7000)).toBe(5000);
    expect(nearestPrintScale(Infinity)).toBe(10000);
  });
});

describe('attachPrint', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="home"></div><div id="print-map"></div>';
    useMapStore.setState({ printRequest: null });
  });

  /** A map that renders into whatever target it gets; `rendered()` finishes the render. */
  const fakeMap = () => {
    const rendered: { done?: () => void } = {};
    const view = {
      getCenter: vi.fn(() => [637000, 486980]),
      getResolution: vi.fn(() => 10),
      setCenter: vi.fn(),
      setResolution: vi.fn(),
      on: vi.fn(),
      un: vi.fn(),
    };
    const home = document.getElementById('home')!;
    const map = {
      getView: () => view,
      getTargetElement: () => home,
      setTarget: vi.fn(),
      once: vi.fn((_: string, cb: () => void) => {
        rendered.done = cb;
        return { target: map, type: 'rendercomplete', listener: cb };
      }),
      render: vi.fn(),
      getViewport: () => document.createElement('div'),
      getOverlayContainer: () => undefined,
      on: vi.fn(),
      un: vi.fn(),
      removeEventListener: vi.fn(),
      getSize: () => undefined,
    } as unknown as OlMap;
    return { map, view, home, rendered };
  };
  const printing = () => document.documentElement.hasAttribute('data-printing');

  it('renders into the sheet at the print scale, prints, then puts the map back', () => {
    const { map, view, home, rendered } = fakeMap();
    const print = vi.fn(() => {
      expect(printing()).toBe(true);
      expect(document.head.textContent).toContain('@page { size: A4 landscape; margin: 10mm; }');
      // The browser says the dialog has closed.
      window.dispatchEvent(new Event('afterprint'));
    });
    vi.stubGlobal('print', print);
    const detach = attachPrint(map);

    useMapStore.getState().requestPrint({ paper: 'A4', orientation: 'landscape', scale: 1000, title: '' });
    expect(map.setTarget).toHaveBeenLastCalledWith(document.getElementById('print-map'));
    // 1:1000 on the ground in Warsaw, where a grid metre is 0.9985 m.
    expect(view.setResolution.mock.lastCall![0]).toBeCloseTo(1 / 6 / 0.9985, 4);
    expect(document.getElementById('print-map')!.style.width).toBe('1662px');
    rendered.done!();
    // A later render (the timer, a pan) must not open the print dialog again.
    rendered.done!();

    expect(print).toHaveBeenCalledOnce();
    expect(map.setTarget).toHaveBeenLastCalledWith(home);
    expect(view.setResolution).toHaveBeenLastCalledWith(10);
    expect(printing()).toBe(false);
    expect(document.head.textContent).not.toContain('@page');
    expect(useMapStore.getState().printRequest).toBeNull();
    detach();
  });

  it('keeps the sheet until the print dialog closes, and gives the map back when no browser says so', () => {
    vi.useFakeTimers();
    const { map, home, rendered } = fakeMap();
    // Phones return from print() at once and capture the page afterwards.
    vi.stubGlobal('print', vi.fn());
    const detach = attachPrint(map);

    useMapStore.getState().requestPrint({ paper: 'A4', orientation: 'portrait', scale: 2000, title: '' });
    rendered.done!();
    expect(printing()).toBe(true);
    expect(map.setTarget).not.toHaveBeenLastCalledWith(home);
    vi.advanceTimersByTime(30000);
    expect(printing()).toBe(true);
    vi.advanceTimersByTime(30000);
    expect(printing()).toBe(false);
    expect(map.setTarget).toHaveBeenLastCalledWith(home);
    detach();
    vi.useRealTimers();
  });
});

describe('print preview', () => {
  it('outlines the printed area at the centre while the print tool is on', () => {
    // OpenLayers watches the map size; jsdom has no ResizeObserver.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    useMapStore.setState({
      tool: 'none',
      printRequest: null,
      printSettings: { paper: 'A4', orientation: 'landscape', scale: 10000, title: '' },
    });
    const map = new OlMap({ view: new View({ projection: PROJECTION, center: [500000, 500000], resolution: 10 }) });
    map.setSize([1000, 800]);
    const detach = attachPrint(map);
    const frame = map.getViewport()!.querySelector<HTMLElement>('.print-preview')!;
    expect(frame.hidden).toBe(true);

    useMapStore.getState().setTool('print');
    expect(frame.hidden).toBe(false);
    // A4 landscape at 1:10 000 is 2770 x 1400 m: 277 x 140 px at 10 m per pixel, in the middle of
    // the map beside the panel (margins 88, 72, 56, 368 px on a wide screen).
    const box = () => [frame.style.left, frame.style.top, frame.style.width, frame.style.height];
    // (The national grid stretches the ground by a fraction of a per mille here: one pixel at most.)
    expect(box()).toEqual(['509px', '346px', '277px', '140px']);

    // Stands still while the map pans; follows the scale and the chosen sheet.
    map.getView().setCenter([510000, 500000]);
    expect(box()).toEqual(['509px', '346px', '277px', '140px']);
    map.getView().setResolution(5);
    useMapStore.getState().setPrintSettings({ scale: 5000 });
    expect(box()).toEqual(['509px', '346px', '277px', '140px']);
    map.getView().setResolution(10);
    expect(box()).toEqual(['579px', '381px', '139px', '70px']);

    useMapStore.getState().setTool('none');
    expect(frame.hidden).toBe(true);
    detach();
    expect(map.getViewport()!.querySelector('.print-preview')).toBeNull();
  });
});
