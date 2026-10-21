import { create } from 'zustand';
import { BASE_MAPS, OVERLAY_BY_ID, selectedSublayers } from '@/services/registry';
import { readUrl, writeUrl } from './url';

export type Panel = 'none' | 'catalog';

export interface FlyTarget {
  center: [number, number];
  zoom: number;
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
  fly: FlyTarget | null;
  /** Called by the map on moveend; keeps store and URL in sync. */
  setView(center: [number, number], zoom: number, scale: number): void;
  setBase(id: string): void;
  toggleOverlay(id: string): void;
  /** Switching a sublayer of an inactive overlay turns the overlay on with only that sublayer. */
  toggleSublayer(id: string, name: string): void;
  setOpacity(id: string, value: number): void;
  setPanel(panel: Panel): void;
  flyTo(center: [number, number], zoom: number): void;
}

const DEFAULT_BASE = 'orto';
const DEFAULT_OVERLAYS = ['kieg'];

const initial = readUrl();

export const useMapStore = create<MapStore>((set, get) => ({
  center: initial.center ?? [500000, 465000],
  zoom: initial.zoom ?? 3,
  scale: Infinity,
  base: initial.base && BASE_MAPS.some((s) => s.id === initial.base) ? initial.base : DEFAULT_BASE,
  overlays: (initial.overlays ?? DEFAULT_OVERLAYS).filter((id) => OVERLAY_BY_ID.has(id)),
  sublayers: initial.sublayers ?? {},
  opacity: {},
  panel: 'none',
  fly: null,

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
  flyTo: (center, zoom) => set({ fly: { center, zoom, seq: (get().fly?.seq ?? 0) + 1 } }),
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
