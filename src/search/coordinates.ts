import { containsCoordinate } from 'ol/extent';
import { fromLonLat } from 'ol/proj';
import { config } from '@/config/runtime';
import { formatCoordinate } from '@/map/format';
import { PROJECTION } from '@/map/projection';
import type { SearchHit } from './provider';

/**
 * Two numbers typed into the search box: latitude and longitude (52.2318, 21.0067 or
 * 52,2318 21,0067), or a point in the map's system written the way its users write it (in
 * PL-1992: X northing first, then Y easting). Anything else is left to the search provider.
 */

/** Decimal points, separated by a comma, a semicolon or spaces. */
const DOTTED = /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/;
/** Decimal commas (Polish), separated by a semicolon or spaces. */
const COMMAS = /^(-?\d+(?:,\d+)?)\s*[;\s]\s*(-?\d+(?:,\d+)?)$/;

const { extent, axisOrientation } = config.map.projection;
const geographic = PROJECTION.getUnits() === 'degrees';

export function parseCoordinates(query: string): SearchHit | undefined {
  const match = DOTTED.exec(query.trim()) ?? COMMAS.exec(query.trim());
  if (!match) return undefined;
  const [a, b] = [match[1], match[2]].map((n) => Number(n.replace(',', '.')));
  const asLatLon = Math.abs(a) <= 90 && Math.abs(b) <= 180 ? fromLonLat([b, a], PROJECTION) : undefined;
  const asMap = geographic ? undefined : axisOrientation === 'neu' ? [b, a] : [a, b];
  const point = [asLatLon, asMap].find((p) => p && containsCoordinate(extent, p));
  if (!point) return undefined;
  const center: [number, number] = [point[0], point[1]];
  return { kind: 'point', label: formatCoordinate(center), center };
}
