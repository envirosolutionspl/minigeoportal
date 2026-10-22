import { beforeEach, describe, expect, it, vi } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import { attachPrint, nearestPrintScale, printExtent, printLayout, serverScale } from './print';
import { EPSG2180 } from './projection';
import { useMapStore } from '@/state/store';

describe('printLayout', () => {
  it('fits the map frame between margins, header and footer, and sets the resolution for the scale', () => {
    const a4 = printLayout({ paper: 'A4', orientation: 'landscape', scale: 1000 });
    expect(a4.page).toEqual([297, 210]);
    expect(a4.mapMm).toEqual([277, 140]);
    expect(a4.mapPx).toEqual([1662, 840]);
    // 1 mm on paper at 1:1000 is 1 m, drawn by 6 pixels.
    expect(a4.resolution).toBeCloseTo(1 / 6);
    // Map pixels shrink to their size on paper: 6 per millimetre.
    expect(a4.zoom * 6).toBeCloseTo(96 / 25.4);
    expect(printLayout({ paper: 'A3', orientation: 'portrait', scale: 1000 }).page).toEqual([297, 420]);
  });
});

describe('printExtent and serverScale', () => {
  it('gives the ground area of the frame and the scale a WMS server sees', () => {
    // A4 landscape frame is 277 × 140 mm: 2770 × 1400 m at 1:10 000.
    const extent = printExtent([1000, 2000], { paper: 'A4', orientation: 'landscape', scale: 10000 });
    [-385, 1300, 2385, 2700].forEach((v, i) => expect(extent[i]).toBeCloseTo(v, 6));
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

  it('renders into the sheet at the print scale, prints, then puts the map back', () => {
    let rendered: (() => void) | undefined;
    const view = { getCenter: vi.fn(() => [1, 2]), getResolution: vi.fn(() => 10), setCenter: vi.fn(), setResolution: vi.fn(), on: vi.fn(), un: vi.fn() };
    const home = document.getElementById('home')!;
    const map = {
      getView: () => view,
      getTargetElement: () => home,
      setTarget: vi.fn(),
      once: vi.fn((_: string, cb: () => void) => {
        rendered = cb;
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
    const print = vi.fn(() => {
      expect(document.documentElement.hasAttribute('data-printing')).toBe(true);
      expect(document.head.textContent).toContain('@page { size: A4 landscape; margin: 10mm; }');
    });
    vi.stubGlobal('print', print);
    const detach = attachPrint(map);

    useMapStore.getState().requestPrint({ paper: 'A4', orientation: 'landscape', scale: 1000, title: '' });
    expect(map.setTarget).toHaveBeenLastCalledWith(document.getElementById('print-map'));
    expect(view.setResolution).toHaveBeenLastCalledWith(1 / 6);
    expect(document.getElementById('print-map')!.style.width).toBe('1662px');
    rendered!();
    // A later render (the timer, a pan) must not open the print dialog again.
    rendered!();

    expect(print).toHaveBeenCalledOnce();
    expect(map.setTarget).toHaveBeenLastCalledWith(home);
    expect(view.setResolution).toHaveBeenLastCalledWith(10);
    expect(document.documentElement.hasAttribute('data-printing')).toBe(false);
    expect(document.head.textContent).not.toContain('@page');
    expect(useMapStore.getState().printRequest).toBeNull();
    detach();
  });
});

describe('print preview', () => {
  it('outlines the printed area at the centre while the print tool is on', () => {
    // OpenLayers watches the map size; jsdom has no ResizeObserver.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    useMapStore.setState({ tool: 'none', printRequest: null, printSettings: { paper: 'A4', orientation: 'landscape', scale: 10000, title: '' } });
    const map = new OlMap({ view: new View({ projection: EPSG2180, center: [500000, 500000], resolution: 10 }) });
    map.setSize([1000, 800]);
    const detach = attachPrint(map);
    const frame = map.getViewport()!.querySelector<HTMLElement>('.print-preview')!;
    expect(frame.hidden).toBe(true);

    useMapStore.getState().setTool('print');
    expect(frame.hidden).toBe(false);
    // A4 landscape at 1:10 000 is 2770 x 1400 m: 277 x 140 px at 10 m per pixel, in the middle of
    // the map beside the panel (margins 88, 72, 56, 368 px on a wide screen).
    const box = () => [frame.style.left, frame.style.top, frame.style.width, frame.style.height];
    expect(box()).toEqual(['510px', '346px', '277px', '140px']);

    // Stands still while the map pans; follows the scale and the chosen sheet.
    map.getView().setCenter([510000, 500000]);
    expect(box()).toEqual(['510px', '346px', '277px', '140px']);
    map.getView().setResolution(5);
    useMapStore.getState().setPrintSettings({ scale: 5000 });
    expect(box()).toEqual(['510px', '346px', '277px', '140px']);
    map.getView().setResolution(10);
    expect(box()).toEqual(['579px', '381px', '139px', '70px']);

    useMapStore.getState().setTool('none');
    expect(frame.hidden).toBe(true);
    detach();
    expect(map.getViewport()!.querySelector('.print-preview')).toBeNull();
  });
});
