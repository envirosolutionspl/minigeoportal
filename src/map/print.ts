import type Map from 'ol/Map';
import { unByKey } from 'ol/Observable';
import { containsExtent, type Extent } from 'ol/extent';
import { getPointResolution } from 'ol/proj';
import { PROJECTION, resolutionToScale } from './projection';
import { duration } from './motion';
import { useMapStore } from '@/state/store';

/**
 * Printing with the browser's own print engine (and its "Save as PDF"): the map is moved for a
 * moment into a sheet laid out for the chosen paper, rendered at the chosen scale and printed.
 * Canvases print even when their tiles come from servers without CORS, so no image proxy is needed.
 */

type Paper = 'A4' | 'A3';
type Orientation = 'landscape' | 'portrait';

export interface PrintOptions {
  paper: Paper;
  orientation: Orientation;
  /** Scale denominator on paper, e.g. 1000 for 1:1000. */
  scale: number;
  title: string;
}

const PAPER_MM: Record<Paper, [short: number, long: number]> = { A4: [210, 297], A3: [297, 420] };
/** Margin, header and footer of the sheet: the layout below and the sheet's CSS use the same numbers. */
const MARGIN_MM = 10;
const HEADER_MM = 14;
const FOOTER_MM = 36;
/** Map pixels per paper millimetre, about 150 dpi: sharper than the screen, still light to load. */
const PX_PER_MM = 6;
const CSS_PX_PER_MM = 96 / 25.4;

/** The sheet's CSS reads these, so a change here moves the header and footer with the map frame. */
export const SHEET_VARS = {
  '--print-header': `${HEADER_MM}mm`,
  '--print-footer': `${FOOTER_MM}mm`,
} as React.CSSProperties;

export const PRINT_SCALES = [500, 1000, 2000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000];

interface PrintLayout {
  page: [width: number, height: number];
  /** Map frame on paper, in millimetres. */
  mapMm: [width: number, height: number];
  /** Map frame in map pixels. */
  mapPx: [width: number, height: number];
  /** View resolution (map units per map pixel) that gives the scale on paper. */
  resolution: number;
  /** CSS zoom that puts the map pixels at their size on paper. */
  zoom: number;
}

/**
 * Metres on the ground per map unit at a place: about 1 in a metric national grid, the cosine of
 * the latitude in Web Mercator, about 111 000 in degrees. Without a place, the projection's
 * nominal metres per unit.
 */
function groundMetres(center?: number[]): number {
  return center ? getPointResolution(PROJECTION, 1, center, 'm') : (PROJECTION.getMetersPerUnit() ?? 1);
}

/** The sheet for paper, orientation and scale; around `center`, the scale holds on the ground there. */
export function printLayout(
  { paper, orientation, scale }: Pick<PrintOptions, 'paper' | 'orientation' | 'scale'>,
  center?: number[],
): PrintLayout {
  const [short, long] = PAPER_MM[paper];
  const page: [number, number] = orientation === 'landscape' ? [long, short] : [short, long];
  const mapMm: [number, number] = [page[0] - 2 * MARGIN_MM, page[1] - 2 * MARGIN_MM - HEADER_MM - FOOTER_MM];
  return {
    page,
    mapMm,
    mapPx: [Math.round(mapMm[0] * PX_PER_MM), Math.round(mapMm[1] * PX_PER_MM)],
    resolution: scale / 1000 / PX_PER_MM / groundMetres(center),
    zoom: CSS_PX_PER_MM / PX_PER_MM,
  };
}

/** Ground area of the map frame around a centre: what ends up on paper. */
export function printExtent([x, y]: number[], options: Pick<PrintOptions, 'paper' | 'orientation' | 'scale'>): Extent {
  const { mapMm } = printLayout(options);
  const units = groundMetres([x, y]);
  const halfW = ((mapMm[0] / 1000) * options.scale * 0.5) / units;
  const halfH = ((mapMm[1] / 1000) * options.scale * 0.5) / units;
  return [x - halfW, y - halfH, x + halfW, y + halfH];
}

/**
 * Scale denominator a WMS server sees on the printed map. Servers assume 0.28 mm pixels, the
 * print has smaller ones, so 1:10 000 on paper reads as about 1:6000; layers switch on and off
 * by this number, which decides what the legend lists.
 */
export const serverScale = (options: Pick<PrintOptions, 'paper' | 'orientation' | 'scale'>, center?: number[]) =>
  resolutionToScale(printLayout(options, center).resolution);

/** The print scale closest to the screen scale; 1:10 000 before the map has reported one. */
export function nearestPrintScale(scale: number): number {
  if (!Number.isFinite(scale)) return 10000;
  return PRINT_SCALES.reduce((best, s) => (Math.abs(Math.log(s / scale)) < Math.abs(Math.log(best / scale)) ? s : best));
}

/** Opens the print panel at the print scale closest to the map, so the frame fits at once. */
export function openPrint(): void {
  const s = useMapStore.getState();
  s.setPrintSettings({ scale: nearestPrintScale(s.scale) });
  s.setTool('print');
}

const RENDER_TIMEOUT_MS = 20000;
/** Browsers that never say the print dialog has closed get the map back after this long. */
const AFTERPRINT_FALLBACK_MS = 60000;

/** Margins (top, right, bottom, left) the print panel takes: the left on wide screens, the bottom on phones. */
function panelMargins(): [number, number, number, number] {
  return window.innerWidth >= 640 ? [88, 72, 56, 368] : [132, 16, Math.round(window.innerHeight * 0.6) + 16, 16];
}

/** Map area left free by the print panel, and its middle: the centre of the printed sheet. */
function freeArea(map: Map): { extent: Extent; center: [number, number] } | undefined {
  const view = map.getView();
  const c = view.getCenter();
  const r = view.getResolution();
  if (!c || !r) return undefined;
  const [w, h] = map.getSize() ?? [0, 0];
  const [top, right, bottom, left] = w > 0 ? panelMargins() : [0, 0, 0, 0];
  const extent: Extent = [c[0] + (left - w / 2) * r, c[1] - (h / 2 - bottom) * r, c[0] + (w / 2 - right) * r, c[1] + (h / 2 - top) * r];
  return { extent, center: [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2] };
}

/**
 * While the print panel is open, the area that will be printed is outlined in the middle of the
 * map beside the panel, and the map moves under it. The frame stands still on screen as the map
 * pans, so it is a plain element over the map (styled in index.css) rather than a map feature:
 * panning costs no redrawing, and only a change of scale or of the sheet resizes it. When the
 * frame does not fit, the map zooms out.
 */
function attachPreview(map: Map): () => void {
  const view = map.getView();
  const frame = document.createElement('div');
  frame.className = 'print-preview';
  frame.hidden = true;
  // Above the map layers, below the map buttons.
  map.getViewport()?.insertBefore(frame, map.getOverlayContainer() ?? null);

  const update = () => {
    const { tool, printSettings, printRequest } = useMapStore.getState();
    const resolution = view.getResolution();
    const size = map.getSize();
    frame.hidden = !(tool === 'print' && !printRequest && resolution && size);
    if (frame.hidden || !resolution || !size) return;
    const [minX, minY, maxX, maxY] = printExtent(view.getCenter() ?? [0, 0], printSettings);
    const [width, height] = [(maxX - minX) / resolution, (maxY - minY) / resolution];
    const [top, right, bottom, left] = panelMargins();
    const [x, y] = [(left + size[0] - right) / 2, (top + size[1] - bottom) / 2];
    const px = (n: number) => `${Math.round(n)}px`;
    Object.assign(frame.style, { left: px(x - width / 2), top: px(y - height / 2), width: px(width), height: px(height) });
  };

  const fitIfHidden = () => {
    const { tool, printSettings } = useMapStore.getState();
    const free = freeArea(map);
    if (tool !== 'print' || !free || !map.getSize()) return;
    const extent = printExtent(free.center, printSettings);
    // Fitting with the panel margins keeps the frame in the middle of the free area.
    if (!containsExtent(free.extent, extent)) view.fit(extent, { padding: panelMargins(), duration: duration(400) });
  };

  const unsubscribe = useMapStore.subscribe((s, prev) => {
    if (s.tool !== prev.tool || s.printSettings !== prev.printSettings || s.printRequest !== prev.printRequest) update();
    if ((s.tool === 'print' && prev.tool !== 'print') || (s.tool === 'print' && s.printSettings !== prev.printSettings)) fitIfHidden();
  });
  view.on('change:resolution', update);
  // Away from the equator of a Mercator map the frame grows and shrinks as the map pans north and south.
  view.on('change:center', update);
  map.on('change:size', update);
  return () => {
    unsubscribe();
    view.un('change:resolution', update);
    view.un('change:center', update);
    map.un('change:size', update);
    frame.remove();
  };
}

export function attachPrint(map: Map): () => void {
  const detachPreview = attachPreview(map);
  const run = (options: PrintOptions) => {
    const frame = document.getElementById('print-map');
    const home = map.getTargetElement();
    if (!frame || !home) return useMapStore.getState().printDone();
    const view = map.getView();
    const center = view.getCenter();
    const resolution = view.getResolution();
    // The sheet is centred where the frame was shown, beside the print panel.
    const sheetCenter = freeArea(map)?.center ?? center;
    const layout = printLayout(options, sheetCenter);
    useMapStore.setState({ printCenter: sheetCenter ? [sheetCenter[0], sheetCenter[1]] : null });

    const page = document.createElement('style');
    page.textContent = `@page { size: ${options.paper} ${options.orientation}; margin: ${MARGIN_MM}mm; }`;
    document.head.append(page);
    document.documentElement.dataset.printing = '';
    frame.style.width = `${layout.mapPx[0]}px`;
    frame.style.height = `${layout.mapPx[1]}px`;

    let done = false;
    let fallback: number | undefined;
    const restore = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.clearTimeout(fallback);
      unByKey(rendered);
      window.removeEventListener('afterprint', restore);
      map.setTarget(home);
      if (center) view.setCenter(center);
      if (resolution) view.setResolution(resolution);
      page.remove();
      delete document.documentElement.dataset.printing;
      useMapStore.getState().printDone();
    };
    let printing = false;
    const print = () => {
      if (done || printing) return;
      printing = true;
      window.clearTimeout(timer);
      // The sheet stays until the print dialog closes: desktop browsers say so (afterprint) before
      // print() returns, phones only when their print preview closes, after the page was captured.
      window.addEventListener('afterprint', restore, { once: true });
      fallback = window.setTimeout(restore, AFTERPRINT_FALLBACK_MS);
      window.print();
    };

    map.setTarget(frame);
    if (sheetCenter) view.setCenter(sheetCenter);
    view.setResolution(layout.resolution);
    // Print what has loaded if some server is slow; whichever comes first prints, once.
    const timer = window.setTimeout(print, RENDER_TIMEOUT_MS);
    const rendered = map.once('rendercomplete', print);
    map.render();
  };

  const unsubscribe = useMapStore.subscribe((s, prev) => {
    if (s.printRequest && s.printRequest !== prev.printRequest) run(s.printRequest);
  });
  return () => {
    unsubscribe();
    detachPreview();
  };
}
