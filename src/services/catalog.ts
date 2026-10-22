import { create } from 'zustand';
import { OVERLAY_BY_ID, type Overlay } from './registry';
import { registerMeta, type WmsMeta } from './meta';
import type { CatalogEntry, CatalogIndex, CatalogIndexEntry } from './catalogTypes';

/**
 * Layers of geoportal.gov.pl beyond our own registry, from the server's catalog. The list
 * arrives when the layer panel is first opened; a layer's definition (sublayers, scale limits,
 * legends) arrives when it is switched on. Until then the app runs on its registry alone.
 */

type LoadState = 'idle' | 'loading' | 'ready' | 'preparing' | 'error';

interface CatalogStore {
  state: LoadState;
  entries: CatalogIndexEntry[];
  byId: Map<string, CatalogIndexEntry>;
  /** Definitions of catalog layers loaded so far, by geoportal id. */
  defs: Map<string, Overlay>;
  load(): Promise<void>;
}

export const useCatalog = create<CatalogStore>((set, get) => ({
  state: 'idle',
  entries: [],
  byId: new Map(),
  defs: new Map(),
  load: async () => {
    if (get().state === 'loading' || get().state === 'ready') return;
    set({ state: 'loading' });
    try {
      const res = await fetch('/api/catalog');
      if (res.status === 503) return set({ state: 'preparing' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const index = (await res.json()) as CatalogIndex;
      set({ state: 'ready', entries: index.entries, byId: new Map(index.entries.map((e) => [e.id, e])) });
    } catch {
      set({ state: 'error' });
    }
  },
}));

/** Our registry entry, or a catalog layer whose definition has been loaded. */
export function overlayDef(id: string): Overlay | undefined {
  return OVERLAY_BY_ID.get(id) ?? useCatalog.getState().defs.get(id);
}

/** Ids that may stand for a catalog layer in a link: geoportal ids such as msKIEG. */
export const CATALOG_ID = /^[A-Za-z][A-Za-z0-9_-]{1,80}$/;

/**
 * Sublayers of a catalog layer: those the geoportal configuration names, or else every named
 * layer of the capabilities except the service's root. All are switched on, as in the geoportal.
 */
export function catalogSublayers(entry: CatalogEntry, meta: WmsMeta | undefined): Overlay['sublayers'] {
  if (entry.sublayers?.length) return entry.sublayers.map((l) => ({ ...l, default: true }));
  const names = Object.entries(meta?.layers ?? {});
  const leaves = names.length > 1 ? names.slice(1) : names;
  return leaves.map(([name, l]) => ({ name, title: l.title, default: true }));
}

const pending = new Map<string, Promise<Overlay | undefined>>();

/** Definition of a catalog layer: fetched once, with its metadata added to the metadata cache. */
export function loadCatalogLayer(id: string): Promise<Overlay | undefined> {
  const known = overlayDef(id);
  if (known) return Promise.resolve(known);
  if (!CATALOG_ID.test(id)) return Promise.resolve(undefined);
  let request = pending.get(id);
  if (!request) {
    request = fetch(`/api/catalog/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) return undefined;
        const { entry, meta } = (await res.json()) as { entry: CatalogEntry; meta?: WmsMeta };
        if (entry.kind !== 'wms' || entry.status !== 'ok') return undefined;
        if (meta) registerMeta(entry.id, meta);
        const def: Overlay = {
          id: entry.id,
          geoportalId: entry.id,
          kind: 'wms',
          title: entry.title,
          description: entry.path.join(' › '),
          topic: entry.topic,
          keywords: [],
          url: entry.url,
          sublayers: catalogSublayers(entry, meta),
        };
        if (def.sublayers.length === 0) return undefined;
        useCatalog.setState((s) => ({ defs: new Map(s.defs).set(def.id, def), byId: s.byId.has(entry.id) ? s.byId : new Map(s.byId).set(entry.id, entry) }));
        return def;
      })
      .catch(() => undefined)
      .finally(() => pending.delete(id));
    pending.set(id, request);
  }
  return request;
}

/** Test hook. */
export const clearCatalog = () => {
  pending.clear();
  useCatalog.setState({ state: 'idle', entries: [], byId: new Map(), defs: new Map() });
};
