import type Map from 'ol/Map';
import { useMapStore } from '@/state/store';

/**
 * Printing with the browser's own print engine (and its "Save as PDF"): the map is moved for a
 * moment into a sheet laid out for the chosen paper, rendered at the chosen scale and printed.
 * Canvases print even when their tiles come from servers without CORS, so no image proxy is needed.
 */

export type Paper = 'A4' | 'A3';
export type Orientation = 'landscape' | 'portrait';

export interface PrintOptions {
  paper: Paper;
  orientation: Orientation;
  /** Scale denominator on paper, e.g. 1000 for 1:1000. */
  scale: number;
  title: string;
}

const PAPER_MM: Record<Paper, [short: number, long: number]> = { A4: [210, 297], A3: [297, 420] };
export const MARGIN_MM = 10;
export const HEADER_MM = 14;
export const FOOTER_MM = 36;
/** Map pixels per paper millimetre, about 150 dpi: sharper than the screen, still light to load. */
export const PX_PER_MM = 6;
const CSS_PX_PER_MM = 96 / 25.4;

export const PRINT_SCALES = [500, 1000, 2000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000];

export interface PrintLayout {
  page: [width: number, height: number];
  /** Map frame on paper, in millimetres. */
  mapMm: [width: number, height: number];
  /** Map frame in map pixels. */
  mapPx: [width: number, height: number];
  /** View resolution (metres per map pixel) that gives the scale on paper. */
  resolution: number;
  /** CSS zoom that puts the map pixels at their size on paper. */
  zoom: number;
}

export function printLayout({ paper, orientation, scale }: Pick<PrintOptions, 'paper' | 'orientation' | 'scale'>): PrintLayout {
  const [short, long] = PAPER_MM[paper];
  const page: [number, number] = orientation === 'landscape' ? [long, short] : [short, long];
  const mapMm: [number, number] = [page[0] - 2 * MARGIN_MM, page[1] - 2 * MARGIN_MM - HEADER_MM - FOOTER_MM];
  return {
    page,
    mapMm,
    mapPx: [Math.round(mapMm[0] * PX_PER_MM), Math.round(mapMm[1] * PX_PER_MM)],
    resolution: scale / 1000 / PX_PER_MM,
    zoom: CSS_PX_PER_MM / PX_PER_MM,
  };
}

/** The print scale closest to the screen scale; 1:10 000 before the map has reported one. */
export function nearestPrintScale(scale: number): number {
  if (!Number.isFinite(scale)) return 10000;
  return PRINT_SCALES.reduce((best, s) => (Math.abs(Math.log(s / scale)) < Math.abs(Math.log(best / scale)) ? s : best));
}

const RENDER_TIMEOUT_MS = 20000;

export function attachPrint(map: Map): () => void {
  const run = (options: PrintOptions) => {
    const frame = document.getElementById('print-map');
    const home = map.getTargetElement();
    if (!frame || !home) return useMapStore.getState().printDone();
    const view = map.getView();
    const center = view.getCenter();
    const resolution = view.getResolution();
    const layout = printLayout(options);

    const page = document.createElement('style');
    page.textContent = `@page { size: ${options.paper} ${options.orientation}; margin: ${MARGIN_MM}mm; }`;
    document.head.append(page);
    document.documentElement.dataset.printing = '';
    frame.style.width = `${layout.mapPx[0]}px`;
    frame.style.height = `${layout.mapPx[1]}px`;

    let done = false;
    const restore = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      map.setTarget(home);
      if (center) view.setCenter(center);
      if (resolution) view.setResolution(resolution);
      page.remove();
      delete document.documentElement.dataset.printing;
      useMapStore.getState().printDone();
    };
    const print = () => {
      window.clearTimeout(timer);
      // The browser blocks here until its print dialog closes.
      window.print();
      restore();
    };

    map.setTarget(frame);
    view.setResolution(layout.resolution);
    // Print what has loaded if some server is slow.
    const timer = window.setTimeout(print, RENDER_TIMEOUT_MS);
    map.once('rendercomplete', print);
    map.render();
  };

  const unsubscribe = useMapStore.subscribe((s, prev) => {
    if (s.printRequest && s.printRequest !== prev.printRequest) run(s.printRequest);
  });
  return unsubscribe;
}
