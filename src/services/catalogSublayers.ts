import type { SubLayer } from './registry';
import type { CatalogEntry, CatalogMeta } from './catalogTypes';

/**
 * Sublayers of a catalog layer: those the geoportal configuration names that the service still
 * has, or else its named layers that are not groups. All are switched on, as in the geoportal.
 * Tiles (WMTS, an ArcGIS tile cache) are one picture, so they have one sublayer.
 * Shared by the server, which counts them for the list, and the app, which draws them.
 */
export function catalogSublayers(entry: Pick<CatalogEntry, 'id' | 'title' | 'sublayers'>, meta: CatalogMeta | undefined): SubLayer[] {
  if (meta?.kind === 'wmts') return [{ name: meta.layer ?? entry.id, title: entry.title, default: true }];
  if (meta?.kind === 'rest' && meta.tiles) return [{ name: 'tiles', title: entry.title, default: true }];
  const layers = meta?.layers ?? {};
  const known = (name: string) => !meta || name in layers;
  const configured = (entry.sublayers ?? []).filter((l) => known(l.name));
  if (configured.length) return configured.map((l) => ({ ...l, default: true }));
  const named = Object.entries(layers);
  const leaves = named.filter(([, l]) => !l.group);
  return (leaves.length ? leaves : named).map(([name, l]) => ({ name, title: l.title, default: true }));
}
