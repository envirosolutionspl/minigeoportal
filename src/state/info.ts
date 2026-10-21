import { create } from 'zustand';
import type { InfoRecord } from '@/services/featureinfo';

export type InfoResult =
  | { status: 'loading' }
  | { status: 'done'; records: InfoRecord[] }
  | { status: 'error'; error: string };

export interface InfoQuery {
  /** EPSG:2180 [easting, northing]. */
  coordinate: [number, number];
  /** Overlay ids queried, in display order. */
  services: string[];
  results: Record<string, InfoResult>;
}

interface InfoStore {
  query: InfoQuery | null;
  start(coordinate: [number, number], services: string[]): void;
  resolve(coordinate: [number, number], id: string, result: InfoResult): void;
  close(): void;
}

export const useInfoStore = create<InfoStore>((set) => ({
  query: null,
  start: (coordinate, services) =>
    set({
      query: { coordinate, services, results: Object.fromEntries(services.map((id) => [id, { status: 'loading' }])) },
    }),
  // Ignores answers that arrive after the user clicked somewhere else.
  resolve: (coordinate, id, result) =>
    set((s) =>
      s.query && s.query.coordinate === coordinate
        ? { query: { ...s.query, results: { ...s.query.results, [id]: result } } }
        : {},
    ),
  close: () => set({ query: null }),
}));
