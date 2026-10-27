import { create } from 'zustand';
import { tileServiceById } from '@/config/runtime';
import { serviceError } from './meta';

/**
 * Availability of a service, as the user sees it in the catalog.
 * unknown: nothing loaded yet; ok: the last load succeeded; degraded: recent loads keep
 * failing in the current area (integration services redirect to county and city servers,
 * which may be down or refuse); blocked: the service answered 401/403 to the metadata request;
 * down: the service did not answer the metadata request; slow: data asked for on the map is long
 * in coming (slow.ts), shown over ok and unknown.
 *
 * No extra network probes: the server's capabilities cache says whether the service answered,
 * and the map's own tile and image loads say whether data arrives.
 */
export type ServiceStatus = 'unknown' | 'ok' | 'slow' | 'degraded' | 'blocked' | 'down';

interface StatusStore {
  status: Record<string, ServiceStatus>;
  /** Layers whose data is long in coming (slow.ts), in the order they became slow. */
  slow: string[];
  /** Called from tile and image load events of the map layers. */
  reportLoad(id: string, ok: boolean): void;
  setSlow(ids: string[]): void;
}

const failures = new Map<string, number>();

function initialStatus(id: string): ServiceStatus {
  const error = serviceError(id);
  if (!error) return 'unknown';
  return /\b40[13]\b/.test(error) ? 'blocked' : 'down';
}

export const useStatusStore = create<StatusStore>((set, get) => ({
  status: {},
  slow: [],
  setSlow: (ids) => {
    const now = get().slow;
    // The ones slow already keep their place; a new one goes last.
    const next = [...now.filter((id) => ids.includes(id)), ...ids.filter((id) => !now.includes(id))];
    if (next.length !== now.length || next.some((id, i) => id !== now[i])) set({ slow: next });
  },
  reportLoad: (id, ok) => {
    // One overlay image covers the whole view, so a single failure matters; tiles fail more often.
    const threshold = tileServiceById.has(id) ? 2 : 1;
    const count = ok ? 0 : (failures.get(id) ?? 0) + 1;
    failures.set(id, count);
    const current = get().status[id] ?? initialStatus(id);
    const next: ServiceStatus = count >= threshold ? 'degraded' : ok ? 'ok' : current;
    if (next !== get().status[id]) set((s) => ({ status: { ...s.status, [id]: next } }));
  },
}));

/** Status shown before any load event: from the capabilities cache. */
export function statusOf(status: Record<string, ServiceStatus>, id: string): ServiceStatus {
  return status[id] ?? initialStatus(id);
}
