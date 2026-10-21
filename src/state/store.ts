import { create } from 'zustand';
import { BASE_SERVICES, OVERLAY_SERVICES, SERVICE_BY_ID } from '@/services/registry';
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
  base: string;
  overlays: string[];
  opacity: Record<string, number>;
  panel: Panel;
  fly: FlyTarget | null;
  /** Called by the map on moveend; keeps store and URL in sync. */
  setView(center: [number, number], zoom: number): void;
  setBase(id: string): void;
  toggleOverlay(id: string): void;
  setOpacity(id: string, value: number): void;
  setPanel(panel: Panel): void;
  flyTo(center: [number, number], zoom: number): void;
}

const DEFAULT_BASE = 'orto';
const DEFAULT_OVERLAYS = ['kieg-dzialki'];

const initial = readUrl();
const validOverlays = (ids: string[]) => ids.filter((id) => OVERLAY_SERVICES.some((s) => s.id === id));

export const useMapStore = create<MapStore>((set, get) => ({
  center: initial.center ?? [500000, 465000],
  zoom: initial.zoom ?? 3,
  base: initial.base && BASE_SERVICES.some((s) => s.id === initial.base) ? initial.base : DEFAULT_BASE,
  overlays: initial.overlays ? validOverlays(initial.overlays) : DEFAULT_OVERLAYS,
  opacity: {},
  panel: 'none',
  fly: null,

  setView: (center, zoom) => set({ center, zoom }),
  setBase: (base) => set({ base }),
  toggleOverlay: (id) =>
    set((s) => ({
      overlays: s.overlays.includes(id) ? s.overlays.filter((o) => o !== id) : [...s.overlays, id],
    })),
  setOpacity: (id, value) => set((s) => ({ opacity: { ...s.opacity, [id]: value } })),
  setPanel: (panel) => set({ panel }),
  flyTo: (center, zoom) => set({ fly: { center, zoom, seq: (get().fly?.seq ?? 0) + 1 } }),
}));

useMapStore.subscribe((s, prev) => {
  if (s.center !== prev.center || s.zoom !== prev.zoom || s.base !== prev.base || s.overlays !== prev.overlays) {
    writeUrl({ center: s.center, zoom: s.zoom, base: s.base, overlays: s.overlays });
  }
});

export const hasInitialView = initial.center !== undefined;

export function serviceOpacity(id: string, opacity: Record<string, number>): number {
  return opacity[id] ?? SERVICE_BY_ID.get(id)?.opacity ?? 1;
}
