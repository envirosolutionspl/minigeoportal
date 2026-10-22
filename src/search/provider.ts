import type { Extent } from '../../shared/config';
import type { UnitLevel } from '@/services/units';

/**
 * The search box asks one provider (app.yaml: search.provider): the GUGiK services, Nominatim
 * (OpenStreetMap) or none. Coordinates are understood whatever the provider (coordinates.ts).
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
  /** GUGiK: 6-digit municipality TERYT code from the geocoder, used to name the units in `detail`. */
  teryt?: string;
  /** GUGiK: a town (miasto), listed before villages, units and objects of a similar name. */
  town?: boolean;
  /** GUGiK: administrative unit; its boundary is fetched when the hit is chosen. */
  unit?: { level: UnitLevel; teryt: string; name: string };
}

export interface SearchProvider {
  /** Results while typing; otherwise after Enter (Nominatim allows one request a second). */
  instant: boolean;
  placeholder: string;
  /** Accessible name of the search box. */
  label: string;
  search(query: string, signal: AbortSignal): Promise<SearchHit[]>;
  /**
   * The outline of a chosen hit, when the result list does not carry it (a building at an
   * address, a town boundary); `persist` keeps it on the map until the search is cleared.
   */
  outline?(hit: SearchHit): Promise<{ wkt?: string; persist: boolean }>;
  /** Credit for the search data, shown under the results. */
  credit?: { text: string; href: string };
}
