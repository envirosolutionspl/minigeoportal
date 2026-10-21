import proj4 from 'proj4';
import { register } from 'ol/proj/proj4';
import { addProjection, get as getProjection } from 'ol/proj';
import Projection from 'ol/proj/Projection';
import WMTSTileGrid from 'ol/tilegrid/WMTS';

/**
 * PL-1992 (EPSG:2180), the projection shared by every GUGiK service.
 *
 * The EPSG definition orders axes northing, easting. WMS 1.3.0 servers follow it,
 * so the projection is registered with `neu` orientation: OpenLayers then swaps the
 * BBOX for WMS 1.3.0 requests, while map coordinates stay [easting, northing]
 * (the same convention OpenLayers uses for EPSG:4326).
 */
addProjection(
  new Projection({
    code: 'EPSG:2180',
    units: 'm',
    axisOrientation: 'neu',
    extent: [100000, 100000, 900000, 900000],
  }),
);
proj4.defs(
  'EPSG:2180',
  '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
);
register(proj4);

export const EPSG2180 = getProjection('EPSG:2180')!;

/** Poland's bounding box in EPSG:2180 [minE, minN, maxE, maxN], used for the initial view. */
export const POLAND_EXTENT: [number, number, number, number] = [170000, 130000, 870000, 800000];

/** OGC standardized rendering pixel size in metres, used to convert scale denominators. */
export const OGC_PIXEL = 0.00028;

/**
 * Every GUGiK WMTS in EPSG:2180 shares one tile matrix set: top-left corner
 * (E 100000, N 850000), 512 px tiles and the scale series below, copied from
 * GetCapabilities. The series is not a plain halving: it steps by 2.5 three times.
 * Services differ only in which levels they publish.
 */
const TILE_ORIGIN: [number, number] = [100000, 850000];
const TILE_SIZE = 512;
const GUGIK_SCALES = [
  30238155.7143, 15119077.8571, 7559538.9286, 3779769.4643, 1889884.7321, 944942.3661, 472471.183, 236235.5915,
  94494.2366, 47247.1183, 23623.5592, 9449.4237, 4724.7118, 1889.8847, 944.9424, 472.4712, 236.2356,
];

export const GUGIK_RESOLUTIONS: number[] = GUGIK_SCALES.map((s) => s * OGC_PIXEL);

/** WMTS grid for a service publishing `levels` matrices starting at series level `first`. */
export function gugikWmtsGrid(first: number, levels: number): WMTSTileGrid {
  return new WMTSTileGrid({
    origin: TILE_ORIGIN,
    tileSize: TILE_SIZE,
    resolutions: GUGIK_RESOLUTIONS.slice(first, first + levels),
    matrixIds: Array.from({ length: levels }, (_, i) => `EPSG:2180:${i}`),
  });
}

/** Tile column and row covering a point at a given level of the shared series. */
export function gugikTileAt(point: [number, number], seriesLevel: number): { col: number; row: number } {
  const span = GUGIK_RESOLUTIONS[seriesLevel] * TILE_SIZE;
  return {
    col: Math.floor((point[0] - TILE_ORIGIN[0]) / span),
    row: Math.floor((TILE_ORIGIN[1] - point[1]) / span),
  };
}
