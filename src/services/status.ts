import { create } from 'zustand';
import { SERVICES, type ServiceDef } from './registry';

/**
 * ok: responded quickly; slow: responded after the threshold; blocked: 401/403;
 * down: network error or timeout; degraded: most recent tiles failed to load
 * (integration services redirect to local servers that may reject requests);
 * unknown: not probed yet.
 */
export type ServiceStatus = 'unknown' | 'ok' | 'slow' | 'blocked' | 'down' | 'degraded';

interface StatusStore {
  status: Record<string, ServiceStatus>;
  probeAll(): Promise<void>;
  /** Called from tile load events; flips a service to `degraded` when loads keep failing. */
  reportTile(id: string, ok: boolean): void;
}

const WINDOW = 12;
const tileHistory = new Map<string, boolean[]>();

const SLOW_MS = 4000;
const TIMEOUT_MS = 10000;

function probeUrl(def: ServiceDef): string {
  if (def.kind === 'wmts') {
    const level = `EPSG:2180:${Math.min(5, def.levels - 1)}`;
    return `${def.url}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${encodeURIComponent(def.layer)}&STYLE=default&FORMAT=${encodeURIComponent(def.format)}&TILEMATRIXSET=EPSG:2180&TILEMATRIX=${level}&TILEROW=1&TILECOL=1`;
  }
  return `${def.url}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${encodeURIComponent(def.layers)}&STYLES=&CRS=EPSG:2180&BBOX=485000,637000,486000,638000&WIDTH=64&HEIGHT=64&FORMAT=image/png&TRANSPARENT=true`;
}

async function probe(def: ServiceDef): Promise<ServiceStatus> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const res = await fetch(probeUrl(def), {
      signal: controller.signal,
      mode: def.cors ? 'cors' : 'no-cors',
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) return 'blocked';
    if (def.cors && !res.ok) return 'down';
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
        set((s) => ({ status: { ...s.status, [def.id]: result } }));
      }),
    );
  },
  reportTile: (id, ok) => {
    const history = tileHistory.get(id) ?? [];
    history.push(ok);
    if (history.length > WINDOW) history.shift();
    tileHistory.set(id, history);
    if (history.length < WINDOW / 2) return;
    const failures = history.filter((v) => !v).length;
    const current = get().status[id];
    const next: ServiceStatus = failures > history.length / 2 ? 'degraded' : current === 'degraded' ? 'ok' : current;
    if (next !== current && next !== undefined) set((s) => ({ status: { ...s.status, [id]: next } }));
  },
}));
