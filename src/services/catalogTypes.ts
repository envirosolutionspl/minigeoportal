import type { Topic } from './registry';
import type { WmsMeta } from './meta';

/**
 * Catalog of geoportal.gov.pl layers, built by the server from the geoportal configuration.
 * Types are shared by the server (server/catalog.ts) and the app.
 */

/**
 * ok: the WMS answers; token: it needs a token that only geoportal.gov.pl gets; refused: it
 * rejects requests from other sites; down: it did not answer at the last check; unsupported:
 * a kind of service the app cannot draw yet (ArcGIS REST, WMTS outside the GUGiK grid).
 */
export type CatalogStatus = 'ok' | 'token' | 'refused' | 'down' | 'unsupported';

export interface CatalogEntry {
  /** Id in the geoportal configuration, e.g. msKIEG. */
  id: string;
  title: string;
  /** Groups of the geoportal layer list, outermost first. */
  path: string[];
  /** Geoportal modules (thematic maps) listing the layer. */
  modules: string[];
  topic: Topic;
  kind: 'wms' | 'wmts' | 'rest';
  url: string;
  /** Rank in the geoportal drawing order, lowest drawn first. */
  order: number;
  /** Sublayers the geoportal shows, when its configuration names them. */
  sublayers?: { name: string; title: string }[];
  infoFormat?: string;
  status: CatalogStatus;
  /** What the server answered when it failed, e.g. "HTTP 403". */
  detail?: string;
  /** When the service was last checked (ISO). */
  checked: string;
  /** Id of our own registry entry for the same layer, which the catalog shows instead. */
  curated?: string;
}

/** Entry of the list the app loads first; the rest comes with the layer (/api/catalog/:id). */
export type CatalogIndexEntry = Omit<CatalogEntry, 'url' | 'sublayers' | 'infoFormat' | 'modules'>;

export interface CatalogIndex {
  generatedAt: string;
  entries: CatalogIndexEntry[];
}

/** One layer with what is needed to draw and query it. */
export interface CatalogLayer {
  entry: CatalogEntry;
  meta?: WmsMeta;
}
