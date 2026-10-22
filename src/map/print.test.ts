import { beforeEach, describe, expect, it, vi } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import type VectorLayer from 'ol/layer/Vector';
import type Polygon from 'ol/geom/Polygon';
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
      once: vi.fn((_: string, cb: () => void) => (rendered = cb)),
      render: vi.fn(),
      addLayer: vi.fn(),
      removeLayer: vi.fn(),
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
    const detach = attachPrint(map);
    const layer = map.getLayers().getArray().at(-1) as VectorLayer;
    expect(layer.getVisible()).toBe(false);
    // Redrawn during a drag and a glide, not only when the map stops.
    expect([layer.getUpdateWhileInteracting(), layer.getUpdateWhileAnimating()]).toEqual([true, true]);

    useMapStore.getState().setTool('print');
    expect(layer.getVisible()).toBe(true);
    const hole = () => (layer.getSource()!.getFeatures()[0].getGeometry() as Polygon).getLinearRing(1)!.getExtent();
    expect(hole()).toEqual(printExtent([500000, 500000], useMapStore.getState().printSettings));

    // Follows the map and the chosen sheet.
    map.getView().setCenter([510000, 500000]);
    useMapStore.getState().setPrintSettings({ scale: 5000 });
    expect(hole()).toEqual(printExtent([510000, 500000], { paper: 'A4', orientation: 'landscape', scale: 5000 }));

    useMapStore.getState().setTool('none');
    expect(layer.getVisible()).toBe(false);
    detach();
    expect(map.getLayers().getLength()).toBe(0);
  });
});
