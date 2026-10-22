import type { Topic } from './registry';
import type { RestMeta, WmsMeta, WmtsMeta } from './meta';

/**
 * Catalog of geoportal.gov.pl layers, built by the server from the geoportal configuration.
 * Types are shared by the server (server/catalog.ts) and the app.
 */

/**
 * ok: the service answers; token: it needs a token that only geoportal.gov.pl gets; refused: it
 * rejects requests from other sites; down: it did not answer at the last check; unsupported:
 * a service the app cannot draw (tiles or a map outside the PL-1992 system, EPSG:2180).
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
  /** Layer of a WMTS named in the configuration; otherwise its first layer is drawn. */
  layer?: string;
  status: CatalogStatus;
  /** What the server answered when it failed, e.g. "HTTP 403". */
  detail?: string;
  /** When the service was last checked (ISO). */
  checked: string;
  /** Id of our own registry entry for the same layer, which the catalog shows instead. */
  curated?: string;
}

/** Entry of the list the app loads first; the rest comes with the layer (/api/catalog/:id). */
export type CatalogIndexEntry = Omit<CatalogEntry, 'url' | 'sublayers' | 'modules' | 'layer'> & {
  /** Number of sublayers to choose from, when more than one. */
  parts?: number;
};

/** What the server knows of a service from its capabilities or description. */
export type CatalogMeta = WmsMeta | WmtsMeta | RestMeta;

export interface CatalogIndex {
  generatedAt: string;
  entries: CatalogIndexEntry[];
}

