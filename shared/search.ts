/** A place found by Nominatim, as the server passes it on to the app (server/modules/nominatim.ts). */
export interface PlaceHit {
  label: string;
  /** WGS 84 [lon, lat]. */
  point: [number, number];
  /** WGS 84 [minLon, minLat, maxLon, maxLat]. */
  bbox: [number, number, number, number];
  /** Nominatim's kind of place: city, road, building… */
  type: string;
}
