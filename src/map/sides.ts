import type Feature from 'ol/Feature';
import { LineString, MultiPolygon, Polygon, type Geometry } from 'ol/geom';
import { toLonLat } from 'ol/proj';
import type { Coordinate } from 'ol/coordinate';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { A, E2 } from './area';
import { formatLength } from './format';
import { PROJECTION, scaleToResolution } from './projection';

const RAD = Math.PI / 180;

/**
 * The length of a short line (a side of a parcel) on the ellipsoid GRS80, from the radii of
 * curvature at its middle: to the millimetre over a kilometre, in any projection of the map. A
 * sphere, as OpenLayers measures, is off by up to 0.15 %, 15 cm on a side of 100 m.
 */
export function sideLength(a: Coordinate, b: Coordinate): number {
  const [lon1, lat1] = toLonLat(a, PROJECTION);
  const [lon2, lat2] = toLonLat(b, PROJECTION);
  const sin = Math.sin(((lat1 + lat2) / 2) * RAD);
  const w = Math.sqrt(1 - E2 * sin * sin);
  const meridian = (A * (1 - E2)) / (w * w * w);
  const parallel = (A / w) * Math.cos(((lat1 + lat2) / 2) * RAD);
  return Math.hypot((lat2 - lat1) * RAD * meridian, (lon2 - lon1) * RAD * parallel);
}

/** Sides get their lengths from this scale in: further out the labels would cover the parcel. */
const SIDES_SCALE = 2500;
/** An outline of more corners than this is no parcel or building (a municipality, a forest): no labels. */
const MAX_CORNERS = 200;

const textStyle = (text: string) =>
  new Text({
    text,
    font: '600 12px system-ui, sans-serif',
    // Along the side, upright; a label longer than its side is left out, so short sides stay clear.
    placement: 'line',
    textBaseline: 'bottom',
    offsetY: -3,
    fill: new Fill({ color: '#1f2937' }),
    stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 3 }),
  });

/** The rings of a polygon or multipolygon (outlines and holes), as coordinates; nothing for other geometries. */
function rings(geometry: Geometry): Coordinate[][] {
  const polygons = geometry instanceof Polygon ? [geometry] : geometry instanceof MultiPolygon ? geometry.getPolygons() : [];
  return polygons.flatMap((p) => p.getLinearRings().map((r) => r.getCoordinates()));
}

/** The sides of the outlines of a polygon, each with its length on the ellipsoid; none for an outline of too many corners. */
export function sides(geometry: Geometry): { side: LineString; length: number }[] {
  const all = rings(geometry);
  if (all.reduce((n, r) => n + r.length, 0) > MAX_CORNERS) return [];
  return all.flatMap((ring) => ring.slice(1).map((end, i) => ({ side: new LineString([ring[i], end]), length: sideLength(ring[i], end) })));
}

/** The perimeter of a polygon in metres: every ring, however many corners. */
export const perimeterOf = (geometry: Geometry) =>
  rings(geometry).reduce((sum, ring) => sum + ring.slice(1).reduce((s, end, i) => s + sideLength(ring[i], end), 0), 0);

/**
 * The lengths of the sides of a parcel or building outline, as styles to draw over it once the
 * map is close enough; built once per feature, as the outline does not change.
 */
export function sideLabels(feature: Feature, resolution: number): Style[] {
  if (resolution > scaleToResolution(SIDES_SCALE)) return [];
  let labels = feature.get('sideLabels') as Style[] | undefined;
  if (!labels) {
    const geometry = feature.getGeometry();
    labels = geometry
      ? sides(geometry).map(({ side, length }) => new Style({ geometry: side, text: textStyle(formatLength(length)) }))
      : [];
    feature.set('sideLabels', labels, true);
  }
  return labels;
}
