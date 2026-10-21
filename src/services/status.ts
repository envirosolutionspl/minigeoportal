import { create } from 'zustand';
import { SERVICES, type ServiceDef } from './registry';

/**
 * ok: GUGiK answered quickly; slow: answered after the threshold; blocked: 401/403 from GUGiK;
 * down: GUGiK did not answer; degraded: map images keep failing in the current area
 * (integration services redirect to county and city servers, which may be down or refuse);
 * unknown: not checked yet.
 */
export type ServiceStatus = 'unknown' | 'ok' | 'slow' | 'blocked' | 'down' | 'degraded';

interface StatusStore {
  status: Record<string, ServiceStatus>;
  probeAll(): Promise<void>;
  /** Called from tile and image load events of the map layers. */
  reportLoad(id: string, ok: boolean): void;
}

const SLOW_MS = 4000;
const TIMEOUT_MS = 10000;
const failures = new Map<string, number>();
const KIND = new Map(SERVICES.map((s) => [s.id, s.kind]));

/**
 * Base maps: one tile. Overlays: GetCapabilities, which GUGiK answers itself;
 * map requests may be redirected to local servers and say nothing about the service.
 */
function probeUrl(def: ServiceDef): string {
  const q =
    def.kind === 'wmts'
      ? new URLSearchParams({
          SERVICE: 'WMTS',
          REQUEST: 'GetTile',
          VERSION: '1.0.0',
          LAYER: def.layer,
          STYLE: 'default',
          FORMAT: def.format,
          TILEMATRIXSET: 'EPSG:2180',
          TILEMATRIX: `EPSG:2180:${Math.min(5, def.levels - 1)}`,
          TILEROW: '1',
          TILECOL: '1',
        })
      : new URLSearchParams({ SERVICE: 'WMS', REQUEST: 'GetCapabilities', VERSION: '1.3.0' });
  return `${def.url}?${q.toString()}`;
}

async function probe(def: ServiceDef): Promise<ServiceStatus> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const res = await fetch(probeUrl(def), { signal: controller.signal, cache: 'no-store' });
    if (res.status === 401 || res.status === 403) return 'blocked';
    if (!res.ok) return 'down';
    return performance.now() - started > SLOW_MS ? 'slow' : 'ok';
  } catch {
    return 'down';
  } finally {
    window.clearTimeout(timer);
  }
}

export const useStatusStore = create<StatusStore>((set, get) => ({
  status: {},
  probeAll: async () => {
    await Promise.all(
      SERVICES.map(async (def) => {
        const result = await probe(def);
        // A result from real map loads is more recent than the probe; keep it.
        if (get().status[def.id] === 'degraded') return;
        set((s) => ({ status: { ...s.status, [def.id]: result } }));
      }),
    );
  },
  reportLoad: (id, ok) => {
    // One overlay image covers the whole view, so a single failure matters; tiles fail more often.
    const threshold = KIND.get(id) === 'wms' ? 1 : 2;
    const count = ok ? 0 : (failures.get(id) ?? 0) + 1;
    failures.set(id, count);
    const current = get().status[id];
    const next: ServiceStatus | undefined =
      count >= threshold ? 'degraded' : ok && current === 'degraded' ? 'ok' : current;
    if (next !== undefined && next !== current) set((s) => ({ status: { ...s.status, [id]: next } }));
  },
}));
