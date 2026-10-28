import { create } from 'zustand';
import { clamp } from 'ol/math';
import { config, overlayById, selectedSublayers } from '@/config/runtime';
import { CATALOG_ID, overlayDef } from '@/services/catalog';
import { HOME_EXTENT } from '@/map/projection';
import { readUrl, writeUrl } from './url';
import { MAX_PARCELS } from './limits';

export { MAX_PARCELS };
import type { PrintOptions } from '@/map/print';

type Panel = 'none' | 'catalog';

/**
 * A map tool. Measuring and printing take over clicks: while one is active, clicks do not ask
 * for information. The time view (map.yaml: timeTravel) leaves clicks to the place panel.
 */
export type Tool = 'none' | 'measure-line' | 'measure-area' | 'profile' | 'parcels' | 'print' | 'time';

/** The tools that take the map's clicks; the others leave them to the place panel and the map menu. */
export const TAKES_CLICKS: ReadonlySet<Tool> = new Set<Tool>(['measure-line', 'measure-area', 'profile', 'parcels', 'print']);

/** Whether the time view's image of the chosen date has arrived, and whether it shows anything. */
export type TimeStatus = 'idle' | 'loading' | 'error' | 'blank';

/** Something the map should show: zoom to it and outline it. */
export interface FocusTarget {
  /** WKT in the map's projection; the view fits its extent. */
  wkt?: string;
  /** Used when there is no geometry. */
  center?: [number, number];
  /** Area to show without outlining anything (the whole country). */
  extent?: [number, number, number, number];
  /** Pixels the area keeps from the map's edges (top, right, bottom, left), clear of panels over the map. */
  padding?: [number, number, number, number];
  /** Scale denominator to zoom to at the current centre, without outlining anything. */
  scale?: number;
  /** Zoom for points; the closest zoom when fitting a geometry. */
  zoom: number;
  /** Parcels and buildings stay outlined until cleared; other objects fade out. */
  persist?: boolean;
  /** The full id of a parcel found by the search, which the parcel selection can take. */
  parcel?: string;
  /** Changes on every request so identical targets still trigger. */
  seq: number;
}

interface MapStore {
  center: [number, number];
  zoom: number;
  /** Current map scale denominator, from the view resolution. */
  scale: number;
  base: string;
  overlays: string[];
  /** Custom sublayer selection per overlay; absent means the configured defaults. */
  sublayers: Record<string, string[]>;
  opacity: Record<string, number>;
  panel: Panel;
  focus: FocusTarget | null;
  tool: Tool;
  /** Changes when measurements are cleared. */
  measureClears: number;
  /** The parcel selection: full ids (TERYT) in the order they were added, at most MAX_PARCELS. */
  parcels: string[];
  /** Text of the last finished measurement, announced to screen readers. */
  measureResult: string;
  /** The line drawn with the terrain profile tool, in map coordinates; null until one is drawn. */
  profileLine: [number, number][] | null;
  /** Print in progress; the map takes it up and clears it when the print dialog closes. */
  printRequest: PrintOptions | null;
  /** Sheet chosen in the print panel; the map outlines the area it covers. */
  printSettings: PrintOptions;
  /** Centre of the sheet being printed, for its caption. */
  printCenter: [number, number] | null;
  /** The print panel was opened from the time view, whose layer and base map stay on the sheet. */
  printFromTime: boolean;
  /** Date shown in the time view; null before one is chosen (the layer's own current value). */
  time: string | null;
  timeStatus: TimeStatus;
  /** The time view's layer (map.yaml: timeTravel.layers), by id; null means the first. */
  timeLayer: string | null;
  /** The sublayers (comma-separated) a module names for the chosen date of a series; null leaves the choice to the layer's editions. */
  timeSublayers: string | null;
  /** The time view compares its date with the present: the layer draws left of a curtain, the base map shows right of it. */
  compare: boolean;
  /** Where the curtain is, as a fraction of the map's width from its left edge. */
  curtain: number;
  /** Changes when the image of the chosen date is asked for again after an error. */
  timeRetries: number;
  /** The base map to go back to when the time view, which forces its own, closes. */
  baseBeforeTime?: string;
  /** Called by the map on moveend; keeps store and URL in sync. */
  setView(center: [number, number], zoom: number, scale: number): void;
  setBase(id: string): void;
  toggleOverlay(id: string): void;
  /** Switching a sublayer of an inactive overlay turns the overlay on with only that sublayer. */
  toggleSublayer(id: string, name: string): void;
  setOpacity(id: string, value: number): void;
  setPanel(panel: Panel): void;
  focusOn(target: Omit<FocusTarget, 'seq'>): void;
  clearFocus(): void;
  /** The whole area, as on first opening. */
  goHome(): void;
  /** Zooms at the current centre to the given scale denominator, e.g. where a layer becomes visible. */
  zoomToScale(scale: number): void;
  setTool(tool: Tool): void;
  clearMeasurements(): void;
  /** Adds a parcel to the selection; false when it is full. */
  addParcel(id: string): boolean;
  removeParcel(id: string): void;
  clearParcels(): void;
  setMeasureResult(text: string): void;
  setProfileLine(line: [number, number][] | null): void;
  setPrintSettings(settings: Partial<PrintOptions>): void;
  requestPrint(options: PrintOptions): void;
  printDone(): void;
  setTime(time: string | null): void;
  setTimeStatus(status: TimeStatus): void;
  retryTime(): void;
  setCompare(compare: boolean): void;
  setCurtain(fraction: number): void;
  setTimeLayer(id: string | null): void;
  setTimeSublayers(names: string | null): void;
}

/** Phones may start on a lighter base map (map.yaml: view.baseMobile), whose tiles load faster on mobile connections. */
const { view } = config.map;
const DEFAULT_BASE =
  view.baseMobile && typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches ? view.baseMobile : view.base;

const initial = readUrl();
/** The time view in a link opens with it, on the base map it forces. */
const TIME_TRAVEL = config.map.timeTravel;
const timeAtStart = initial.time !== undefined && TIME_TRAVEL !== undefined;
const LINKED_BASE = config.map.baseMaps.find((s) => s.id === initial.base)?.id ?? DEFAULT_BASE;
const LINKED_TIME_LAYER = timeAtStart && TIME_TRAVEL?.layers.some((l) => l.id === initial.timeLayer) ? (initial.timeLayer ?? null) : null;

/**
 * The base map the time view forces under a layer: the present of the same kind (today's photos
 * under old photos, today's map under old maps), else the view's own; none leaves the base map as it is.
 */
function forcedBase(timeLayer: string | null): string | undefined {
  const layers = TIME_TRAVEL?.layers ?? [];
  return (layers.find((l) => l.id === timeLayer) ?? layers[0])?.base ?? TIME_TRAVEL?.base;
}

export const useMapStore = create<MapStore>((set, get) => ({
  center: initial.center ?? view.center,
  zoom: initial.zoom ?? view.zoom,
  scale: Infinity,
  base: (timeAtStart && forcedBase(LINKED_TIME_LAYER)) || LINKED_BASE,
  // Catalog layers in a link are loaded by the map (with the catalog on); unknown ids simply draw nothing.
  overlays: (initial.overlays ?? view.overlays).filter(
    (id) => overlayById.has(id) || (config.modules.gugik?.catalog === true && CATALOG_ID.test(id)),
  ),
  sublayers: initial.sublayers ?? {},
  opacity: {},
  panel: 'none',
  focus: null,
  tool: timeAtStart ? 'time' : 'none',
  measureClears: 0,
  parcels: initial.parcels ?? [],
  measureResult: '',
  profileLine: null,
  printRequest: null,
  printFromTime: false,
  printSettings: { paper: 'A4', orientation: 'landscape', scale: 10000, title: '' },
  printCenter: null,
  time: timeAtStart ? (initial.time ?? null) : null,
  timeLayer: LINKED_TIME_LAYER,
  timeSublayers: null,
  compare: timeAtStart && initial.compare === true,
  curtain: 0.5,
  // The view of a link closes onto the base map the link named.
  ...(timeAtStart && forcedBase(LINKED_TIME_LAYER) ? { baseBeforeTime: LINKED_BASE } : {}),
  timeStatus: 'idle',
  timeRetries: 0,

  setView: (center, zoom, scale) => set({ center, zoom, scale }),
  setBase: (base) => set({ base }),
  toggleOverlay: (id) =>
    set((s) => {
      if (!s.overlays.includes(id)) return { overlays: [...s.overlays, id] };
      const { [id]: _, ...sublayers } = s.sublayers;
      return { overlays: s.overlays.filter((o) => o !== id), sublayers };
    }),
  toggleSublayer: (id, name) =>
    set((s) => {
      const def = overlayDef(id);
      if (!def) return {};
      if (!s.overlays.includes(id)) {
        return { overlays: [...s.overlays, id], sublayers: { ...s.sublayers, [id]: [name] } };
      }
      const current = selectedSublayers(def, s.sublayers);
      const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
      const { [id]: _, ...rest } = s.sublayers;
      if (next.length === 0) return { overlays: s.overlays.filter((o) => o !== id), sublayers: rest };
      return { sublayers: { ...rest, [id]: next } };
    }),
  setOpacity: (id, value) => set((s) => ({ opacity: { ...s.opacity, [id]: value } })),
  setPanel: (panel) => set({ panel }),
  focusOn: (target) => set({ focus: { ...target, seq: (get().focus?.seq ?? 0) + 1 } }),
  clearFocus: () => set({ focus: null }),
  goHome: () => get().focusOn({ extent: HOME_EXTENT, zoom: 0 }),
  zoomToScale: (scale) => get().focusOn({ scale, zoom: 0 }),
  // The time view forces the base map of its layer (the photos under the archival photos, the
  // map under the old maps) and gives the one used before back when it closes. Printing from it
  // keeps its layer and base map on the sheet, and closing the print goes back to it.
  setTool: (tool) =>
    set((s) => {
      if (tool === s.tool) return {};
      if (s.tool === 'time' && tool === 'print') return { tool, printFromTime: true };
      if (s.printFromTime && (tool === 'none' || tool === 'time')) return { tool: 'time', printFromTime: false };
      const leaving = timeShown(s);
      const forced = forcedBase(s.timeLayer);
      if (tool === 'time' && forced) return { tool, base: forced, baseBeforeTime: s.base };
      if (leaving && s.baseBeforeTime !== undefined)
        return { tool, base: s.baseBeforeTime, baseBeforeTime: undefined, timeStatus: 'idle', printFromTime: false };
      return { tool, printFromTime: false, ...(leaving ? { timeStatus: 'idle' as const } : {}) };
    }),
  clearMeasurements: () => set((s) => ({ measureClears: s.measureClears + 1, measureResult: '' })),
  addParcel: (id) => {
    const { parcels } = get();
    if (parcels.includes(id)) return true;
    if (parcels.length >= MAX_PARCELS) return false;
    set({ parcels: [...parcels, id] });
    return true;
  },
  removeParcel: (id) => set((s) => ({ parcels: s.parcels.filter((p) => p !== id) })),
  clearParcels: () => set({ parcels: [] }),
  setMeasureResult: (measureResult) => set({ measureResult }),
  setProfileLine: (profileLine) => set({ profileLine }),
  setPrintSettings: (settings) => set((s) => ({ printSettings: { ...s.printSettings, ...settings } })),
  requestPrint: (options) => set({ printRequest: { ...options } }),
  // The print panel closes with the print, back to the time view when printed from it (setTool).
  printDone: () => {
    set({ printRequest: null });
    if (get().tool === 'print') get().setTool('none');
  },
  setTime: (time) => set({ time }),
  setTimeStatus: (timeStatus) => set({ timeStatus }),
  retryTime: () => set((s) => ({ timeRetries: s.timeRetries + 1 })),
  setCompare: (compare) => set({ compare }),
  setCurtain: (fraction) => set({ curtain: clamp(fraction, 0, 1) }),
  // Another layer of the open view brings its own base map; the one before the view stays remembered.
  setTimeLayer: (timeLayer) =>
    set((s) => {
      const forced = s.tool === 'time' ? forcedBase(timeLayer) : undefined;
      if (!forced) return { timeLayer, timeSublayers: null };
      return { timeLayer, timeSublayers: null, base: forced, baseBeforeTime: s.baseBeforeTime ?? s.base };
    }),
  setTimeSublayers: (timeSublayers) => set((s) => (s.timeSublayers === timeSublayers ? {} : { timeSublayers })),
}));

/** The time view's layer is on the map: in the view, or on a print opened from it. */
export const timeShown = (s: Pick<MapStore, 'tool' | 'printFromTime'>) => s.tool === 'time' || (s.tool === 'print' && s.printFromTime);

/** What a link to the map carries: the view, the layers and, while the time view is open, its date. */
export const urlState = (s: MapStore) => ({
  center: s.center,
  zoom: s.zoom,
  base: s.base,
  overlays: s.overlays,
  sublayers: s.sublayers,
  ...(timeShown(s) && s.time
    ? { time: s.time, ...(s.compare ? { compare: true } : {}), ...(s.timeLayer ? { timeLayer: s.timeLayer } : {}) }
    : {}),
  ...(s.parcels.length > 0 ? { parcels: s.parcels } : {}),
});

useMapStore.subscribe((s, prev) => {
  if (
    s.center !== prev.center ||
    s.zoom !== prev.zoom ||
    s.base !== prev.base ||
    s.overlays !== prev.overlays ||
    s.sublayers !== prev.sublayers ||
    s.tool !== prev.tool ||
    s.time !== prev.time ||
    s.compare !== prev.compare ||
    s.timeLayer !== prev.timeLayer ||
    s.parcels !== prev.parcels
  ) {
    writeUrl(urlState(s));
  }
});

export const hasInitialView = initial.center !== undefined;

export function overlayOpacity(id: string, opacity: Record<string, number>): number {
  return opacity[id] ?? overlayDef(id)?.opacity ?? 1;
}

/**
 * Development only: a hot update would create a second store while the map keeps listening to
 * the first one, so base map and layer switches would stop reaching it. Reload the page instead.
 */
import.meta.hot?.accept(() => window.location.reload());
