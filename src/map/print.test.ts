import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Map from 'ol/Map';
import { attachPrint, nearestPrintScale, printLayout } from './print';
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
    const view = { getCenter: vi.fn(() => [1, 2]), getResolution: vi.fn(() => 10), setCenter: vi.fn(), setResolution: vi.fn() };
    const home = document.getElementById('home')!;
    const map = {
      getView: () => view,
      getTargetElement: () => home,
      setTarget: vi.fn(),
      once: vi.fn((_: string, cb: () => void) => (rendered = cb)),
      render: vi.fn(),
    } as unknown as Map;
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

    expect(print).toHaveBeenCalledOnce();
    expect(map.setTarget).toHaveBeenLastCalledWith(home);
    expect(view.setResolution).toHaveBeenLastCalledWith(10);
    expect(document.documentElement.hasAttribute('data-printing')).toBe(false);
    expect(document.head.textContent).not.toContain('@page');
    expect(useMapStore.getState().printRequest).toBeNull();
    detach();
  });
});
