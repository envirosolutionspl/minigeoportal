import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';
import { addProjection, get as getProjection } from 'ol/proj';
import Projection from 'ol/proj/Projection';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import { config } from '@/config/runtime';

/**
 * The map's coordinate system (map.yaml: projection). Services are asked for images in it, so
 * nothing is reprojected in the browser.
 *
 * PL-1992 (EPSG:2180) orders its axes northing, easting, and WMS 1.3.0 servers follow it, so it is
 * registered with `neu` orientation: OpenLayers then swaps the BBOX for WMS 1.3.0 requests, while
 * map coordinates stay [easting, northing] (the convention OpenLayers uses for EPSG:4326).
 */
const def = config.map.projection;
// Systems OpenLayers knows (EPSG:3857, EPSG:4326) keep their own definition.
if (!getProjection(def.code)) {
  addProjection(
    new Projection({
      code: def.code,
      units: /\+proj=longlat\b/.test(def.proj4 ?? '') ? 'degrees' : 'm',
      axisOrientation: def.axisOrientation,
      extent: def.extent,
    }),
  );
}
if (def.proj4) {
  proj4.defs(def.code, def.proj4);
  register(proj4);
}

export const PROJECTION = getProjection(def.code)!;

/** OGC standardized rendering pixel size in metres, used to convert scale denominators. */
export const OGC_PIXEL = 0.00028;
const metresPerUnit = PROJECTION.getMetersPerUnit() ?? 1;

export const scaleToResolution = (scale: number) => (scale * OGC_PIXEL) / metresPerUnit;
export const resolutionToScale = (resolution: number) => (resolution * metresPerUnit) / OGC_PIXEL;

/** Resolutions of the zoom levels (map.yaml: zoom.scales). */
export const RESOLUTIONS: number[] = config.map.scales.map(scaleToResolution);

/** The zoom level closest to a scale, so the same scale means the same view on any series of levels. */
export function zoomForScale(scale: number): number {
  const target = Math.log(scaleToResolution(scale));
  let best = 0;
  RESOLUTIONS.forEach((r, i) => {
    if (Math.abs(Math.log(r) - target) < Math.abs(Math.log(RESOLUTIONS[best]) - target)) best = i;
  });
  return best;
}

/** The whole area of the map: first visit and the "whole area" button. */
export const HOME_EXTENT = config.map.view.home;

/**
 * WMTS grid for a service publishing `levels` of the zoom levels starting at `first`, on the tile
 * grid the services share (map.yaml: tileGrid). Used until their capabilities are cached.
 */
export function sharedWmtsGrid(first: number, levels: number): WMTSTileGrid {
  const grid = config.map.tileGrid!;
  return new WMTSTileGrid({
    origin: grid.origin,
    tileSize: grid.tileSize,
    resolutions: RESOLUTIONS.slice(first, first + levels),
    matrixIds: Array.from({ length: levels }, (_, i) => `${grid.matrixIdPrefix}${i}`),
  });
}
