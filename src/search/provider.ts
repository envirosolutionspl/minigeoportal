import type { Extent } from '../../shared/config';

/**
 * The search box asks one provider (app.yaml: search.provider), loaded with the app
 * (src/modules/index.ts): Nominatim (OpenStreetMap), a module's own (gugik) or none. Coordinates are understood whatever the provider (coordinates.ts).
 */

export type HitKind = 'address' | 'street' | 'place' | 'unit' | 'nature' | 'parcel' | 'point';

export interface SearchHit {
  kind: HitKind;
  label: string;
  detail?: string;
  /** Map coordinate [easting, northing]; absent when the geometry or extent says where the hit is. */
  center?: [number, number];
  /** WKT in the map's system, when the service returned a geometry. */
  wkt?: string;
  /** Area to show, for hits without a geometry that are too large for one point (a town). */
  extent?: Extent;
  /** Scale denominator to show the hit at, when its kind's usual one does not fit (a parcel is small). */
  scale?: number;
  /** A parcel's full id (TERYT), which the parcel selection takes. */
  id?: string;
}

/**
 * What a search found. `unavailable` names the services that did not answer in time, so the list
 * can say the results may be incomplete; a provider with one service simply throws instead.
 */
export type SearchResults = SearchHit[] & { unavailable?: string[] };

export interface SearchProvider {
  /** Results while typing; otherwise after Enter (Nominatim allows one request a second). */
  instant: boolean;
  placeholder: string;
  /** Accessible name of the search box. */
  label: string;
  search(query: string, signal: AbortSignal): Promise<SearchResults>;
  /**
   * The outline of a chosen hit, when the result list does not carry it (a building at an
   * address, a town boundary); `persist` keeps it on the map until the search is cleared.
   */
  outline?(hit: SearchHit): Promise<{ wkt?: string; persist: boolean; sides?: boolean }>;
  /** Credit for the search data, shown under the results. */
  credit?: { text: string; href: string };
}
