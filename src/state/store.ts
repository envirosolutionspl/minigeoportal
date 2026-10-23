import { create } from 'zustand';
import { config, overlayById, selectedSublayers } from '@/config/runtime';
import { CATALOG_ID, overlayDef } from '@/services/catalog';
import { HOME_EXTENT } from '@/map/projection';
import { readUrl, writeUrl } from './url';
import type { PrintOptions } from '@/map/print';

type Panel = 'none' | 'catalog';

/** A map tool that takes over clicks: while one is active, clicks do not ask for information. */
export type Tool = 'none' | 'measure-line' | 'measure-area' | 'print';

/** Something the map should show: zoom to it and outline it. */
export interface FocusTarget {
  /** WKT in the map's coordinate system; the view fits its extent. */
  wkt?: string;
  /** Used when there is no geometry. */
  center?: [number, number];
  /** Area to show without outlining anything (the whole country). */
  extent?: [number, number, number, number];
  /** Scale denominator to zoom to at the current centre, without outlining anything. */
  scale?: number;
  /** Zoom for points; the closest zoom when fitting a geometry. */
  zoom: number;
  /** Parcels and buildings stay outlined until cleared; other objects fade out. */
  persist?: boolean;
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
  /** Text of the last finished measurement, announced to screen readers. */
  measureResult: string;
  /** Print in progress; the map takes it up and clears it when the print dialog closes. */
  printRequest: PrintOptions | null;
  /** Sheet chosen in the print panel; the map outlines the area it covers. */
  printSettings: PrintOptions;
  /** Centre of the sheet being printed, for its caption. */
  printCenter: [number, number] | null;
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
  setMeasureResult(text: string): void;
  setPrintSettings(settings: Partial<PrintOptions>): void;
  requestPrint(options: PrintOptions): void;
  printDone(): void;
}

/** Phones may start on a lighter base map (map.yaml: view.baseMobile), whose tiles load faster on mobile connections. */
const { view } = config.map;
const DEFAULT_BASE =
  view.baseMobile && typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches ? view.baseMobile : view.base;

const initial = readUrl();

export const useMapStore = create<MapStore>((set, get) => ({
  center: initial.center ?? view.center,
  zoom: initial.zoom ?? view.zoom,
  scale: Infinity,
  base: config.map.baseMaps.find((s) => s.id === initial.base)?.id ?? DEFAULT_BASE,
  // Catalog layers in a link are loaded by the map; unknown ids simply draw nothing.
  overlays: (initial.overlays ?? view.overlays).filter((id) => overlayById.has(id) || CATALOG_ID.test(id)),
  sublayers: initial.sublayers ?? {},
  opacity: {},
  panel: 'none',
  focus: null,
  tool: 'none',
  measureClears: 0,
  measureResult: '',
  printRequest: null,
  printSettings: { paper: 'A4', orientation: 'landscape', scale: 10000, title: '' },
  printCenter: null,

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
  setTool: (tool) => set({ tool }),
  clearMeasurements: () => set((s) => ({ measureClears: s.measureClears + 1, measureResult: '' })),
  setMeasureResult: (measureResult) => set({ measureResult }),
  setPrintSettings: (settings) => set((s) => ({ printSettings: { ...s.printSettings, ...settings } })),
  requestPrint: (options) => set({ printRequest: { ...options } }),
  printDone: () => set({ printRequest: null }),
}));

useMapStore.subscribe((s, prev) => {
  if (
    s.center !== prev.center ||
    s.zoom !== prev.zoom ||
    s.base !== prev.base ||
    s.overlays !== prev.overlays ||
    s.sublayers !== prev.sublayers
  ) {
    writeUrl({ center: s.center, zoom: s.zoom, base: s.base, overlays: s.overlays, sublayers: s.sublayers });
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
