import { toLonLat } from 'ol/proj';

/** Polish number formats for coordinates and measurements. */

const int = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const two = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const deg = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 5, maximumFractionDigits: 5 });

/**
 * A point in PL-1992 as surveyors write it (X = northing, Y = easting) and in WGS 84.
 * `coordinate` is the map coordinate [easting, northing].
 */
export function formatCoordinate(coordinate: number[]): string {
  const [e, n] = coordinate;
  const [lon, lat] = toLonLat(coordinate, 'EPSG:2180');
  return `PL-1992 X ${int.format(n)}, Y ${int.format(e)} · ${deg.format(lat)}° N, ${deg.format(lon)}° E`;
}

/** Length in metres, as metres below a kilometre. */
export function formatLength(metres: number): string {
  return metres < 1000 ? `${one.format(metres)} m` : `${two.format(metres / 1000)} km`;
}

/** Area in square metres: m² for small areas, hectares (with m²) for parcels, km² for large ones. */
export function formatArea(m2: number): string {
  if (m2 < 10000) return `${int.format(m2)} m²`;
  if (m2 < 1_000_000) return `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 4 }).format(m2 / 10000)} ha (${int.format(m2)} m²)`;
  return `${two.format(m2 / 1_000_000)} km²`;
}
