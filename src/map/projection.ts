import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';
import { get as getProjection } from 'ol/proj';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import TileGrid from 'ol/tilegrid/TileGrid';

/** PL-1992 (EPSG:2180), the projection shared by every GUGiK service. */
proj4.defs(
  'EPSG:2180',
  '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);
register(proj4);

export const EPSG2180 = getProjection('EPSG:2180')!;
EPSG2180.setExtent([100000, 100000, 900000, 900000]);

/** Poland's bounding box in EPSG:2180, used for the initial view. */
export const POLAND_EXTENT: [number, number, number, number] = [170000, 130000, 870000, 800000];

/**
 * Every GUGiK WMTS in EPSG:2180 shares one tile matrix set:
 * origin (100000, 850000), 512 px tiles, scale 30 238 156 / 2^n.
 * Services differ only in which levels they publish.
 */
const TILE_ORIGIN: [number, number] = [100000, 850000];
const TILE_SIZE = 512;
const LEVEL0_RESOLUTION = 30238155.714285716 * 0.00028;

export const GUGIK_RESOLUTIONS: number[] = Array.from({ length: 17 }, (_, i) => LEVEL0_RESOLUTION / 2 ** i);

/** WMTS grid for a service publishing `levels` matrices starting at series level `first`. */
export function gugikWmtsGrid(first: number, levels: number): WMTSTileGrid {
  return new WMTSTileGrid({
    origin: TILE_ORIGIN,
    tileSize: TILE_SIZE,
    resolutions: GUGIK_RESOLUTIONS.slice(first, first + levels),
    matrixIds: Array.from({ length: levels }, (_, i) => `EPSG:2180:${i}`),
  });
}

/** Grid for tiled WMS requests, aligned with the WMTS grid so tiles line up and cache well. */
export const WMS_TILE_GRID = new TileGrid({
  origin: TILE_ORIGIN,
  tileSize: TILE_SIZE,
  resolutions: GUGIK_RESOLUTIONS,
});
