import { create } from 'zustand';
import { overlayById, type Overlay } from '@/config/runtime';
import { locale } from '@/i18n';
import { registerMeta } from './meta';
import { catalogSublayers } from './catalogSublayers';
import type { CatalogEntry, CatalogIndex, CatalogIndexEntry, CatalogMeta } from './catalogTypes';

/**
 * Layers of geoportal.gov.pl beyond the configured overlays, from the server's catalog. The list
 * arrives when the layer panel is first opened; a layer's definition (sublayers, scale limits,
 * legends) arrives when it is switched on. Until then the app runs on the configured overlays alone.
 */

export type LoadState = 'idle' | 'loading' | 'ready' | 'preparing' | 'error';

/** Our own API answers in well under this; a connection that hangs must not leave the panel loading for good. */
const TIMEOUT_MS = 10_000;

/** Available layers first, then by title: the order the panel lists them in, settled once for the hundreds of entries. */
const byAvailability = (a: CatalogIndexEntry, b: CatalogIndexEntry) =>
  Number(a.status !== 'ok') - Number(b.status !== 'ok') || a.title.localeCompare(b.title, locale());

interface CatalogStore {
  state: LoadState;
  entries: CatalogIndexEntry[];
  byId: Map<string, CatalogIndexEntry>;
  /** Definitions of catalog layers loaded so far, by geoportal id. */
  defs: Map<string, Overlay>;
  /** Layers whose definition could not be loaded, so the panel says so instead of waiting. */
  failed: Set<string>;
  load(): Promise<void>;
}

export const useCatalog = create<CatalogStore>((set, get) => ({
  state: 'idle',
  entries: [],
  byId: new Map(),
  defs: new Map(),
  failed: new Set(),
  load: async () => {
    // Tried again after an error or while the server was still building the list.
    if (get().state === 'loading' || get().state === 'ready') return;
    set({ state: 'loading' });
    try {
      const res = await fetch('/api/catalog', { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 503) return set({ state: 'preparing' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const index = (await res.json()) as CatalogIndex;
      const entries = [...index.entries].sort(byAvailability);
      set({ state: 'ready', entries, byId: new Map(entries.map((e) => [e.id, e])) });
    } catch {
      set({ state: 'error' });
    }
  },
}));

/** A configured overlay, or a catalog layer whose definition has been loaded. */
export function overlayDef(id: string): Overlay | undefined {
  return overlayById.get(id) ?? useCatalog.getState().defs.get(id);
}

/**
 * Ids that may stand for a catalog layer in a link: geoportal ids such as msKIEG, which may
 * contain Polish letters (groupDanePowPob_Działki).
 */
export const CATALOG_ID = /^\p{L}[\p{L}\p{N}_-]{1,80}$/u;

const pending = new Map<string, Promise<Overlay | undefined>>();

/** Definition of a catalog layer: fetched once, with its metadata added to the metadata cache. */
export function loadCatalogLayer(id: string): Promise<Overlay | undefined> {
  const known = overlayDef(id);
  if (known) return Promise.resolve(known);
  if (!CATALOG_ID.test(id)) return Promise.resolve(undefined);
  let request = pending.get(id);
  if (!request) {
    request = fetch(`/api/catalog/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      .then(async (res) => {
        if (!res.ok) return undefined;
        const { entry, meta } = (await res.json()) as { entry: CatalogEntry; meta?: CatalogMeta };
        if (entry.status !== 'ok') return undefined;
        if (meta) registerMeta(entry.id, meta);
        const def: Overlay = {
          id: entry.id,
          catalogId: entry.id,
          kind: entry.kind,
          title: entry.title,
          description: entry.path.join(' › '),
          topic: entry.topic,
          keywords: [],
          url: entry.url,
          sublayers: catalogSublayers(entry, meta),
        };
        if (def.sublayers.length === 0) return undefined;
        useCatalog.setState((s) => ({
          defs: new Map(s.defs).set(def.id, def),
          byId: s.byId.has(entry.id) ? s.byId : new Map(s.byId).set(entry.id, entry),
        }));
        return def;
      })
      .catch(() => undefined)
      .then((def) => {
        if (!def) useCatalog.setState((s) => ({ failed: new Set(s.failed).add(id) }));
        return def;
      })
      .finally(() => pending.delete(id));
    pending.set(id, request);
  }
  return request;
}

/** Test hook. */
export const clearCatalog = () => {
  pending.clear();
  useCatalog.setState({ state: 'idle', entries: [], byId: new Map(), defs: new Map(), failed: new Set() });
};
