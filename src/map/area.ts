import { getArea } from 'ol/sphere';
import { getCenter } from 'ol/extent';
import { toLonLat } from 'ol/proj';
import type { Geometry } from 'ol/geom';
import { PROJECTION } from './projection';

/** GRS80, the ellipsoid of PL-1992, against which the land register gives the areas of parcels. */
export const A = 6378137;
export const E2 = 0.0066943800229;

/**
 * The radius of the sphere that fits the ellipsoid where a geometry lies (the Gaussian mean
 * radius at its latitude). OpenLayers measures on a sphere, by default of the Earth's mean
 * radius, which in Poland makes areas about 0.4 % too small; on this one the area of a parcel or
 * a field is the area on the ellipsoid.
 */
function radiusAt(geometry: Geometry): number {
  const [, latitude] = toLonLat(getCenter(geometry.getExtent()), PROJECTION);
  const sin = Math.sin((latitude * Math.PI) / 180);
  return (A * Math.sqrt(1 - E2)) / (1 - E2 * sin * sin);
}

/** Area in square metres on the ellipsoid. */
export const areaOf = (geometry: Geometry) => getArea(geometry, { projection: PROJECTION, radius: radiusAt(geometry) });
