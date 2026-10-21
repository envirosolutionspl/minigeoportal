import { create } from 'zustand';
import { BASE_MAPS, OVERLAY_BY_ID, selectedSublayers } from '@/services/registry';
import { POLAND_EXTENT } from '@/map/projection';
import { readUrl, writeUrl } from './url';

export type Panel = 'none' | 'catalog';

/** Something the map should show: zoom to it and outline it. */
export interface FocusTarget {
  /** EPSG:2180 WKT; the view fits its extent. */
  wkt?: string;
  /** Used when there is no geometry. */
  center?: [number, number];
  /** Area to show without outlining anything (the whole country). */
  extent?: [number, number, number, number];
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
  /** Custom sublayer selection per overlay; absent means the registry defaults. */
  sublayers: Record<string, string[]>;
  opacity: Record<string, number>;
  panel: Panel;
  focus: FocusTarget | null;
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
  /** Whole country, as on first opening. */
  goHome(): void;
}

const DEFAULT_BASE = 'orto';
const DEFAULT_OVERLAYS = ['kieg'];

const initial = readUrl();

export const useMapStore = create<MapStore>((set, get) => ({
  center: initial.center ?? [500000, 465000],
  zoom: initial.zoom ?? 3,
  scale: Infinity,
  base: BASE_MAPS.find((s) => s.id === initial.base)?.id ?? DEFAULT_BASE,
  overlays: (initial.overlays ?? DEFAULT_OVERLAYS).filter((id) => OVERLAY_BY_ID.has(id)),
  sublayers: initial.sublayers ?? {},
  opacity: {},
  panel: 'none',
  focus: null,

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
      const def = OVERLAY_BY_ID.get(id);
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
  goHome: () => get().focusOn({ extent: POLAND_EXTENT, zoom: 0 }),
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
  return opacity[id] ?? OVERLAY_BY_ID.get(id)?.opacity ?? 1;
}
