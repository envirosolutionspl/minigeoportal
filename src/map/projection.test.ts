import { describe, expect, it } from 'vitest';
import { fromLonLat, toLonLat } from 'ol/proj';
import {
  HOME_EXTENT,
  OGC_PIXEL,
  PROJECTION,
  RESOLUTIONS,
  resolutionToScale,
  scaleToResolution,
  sharedWmtsGrid,
  zoomForScale,
} from './projection';

describe('PL-1992 of the default configuration', () => {
  it('is registered with north-east axis order, so WMS 1.3.0 BBOX is swapped by OpenLayers', () => {
    expect(PROJECTION.getCode()).toBe('EPSG:2180');
    expect(PROJECTION.getAxisOrientation()).toBe('neu');
    expect(PROJECTION.getUnits()).toBe('m');
  });

  it('places the Palace of Culture in Warsaw at the known PL-1992 coordinates', () => {
    const [e, n] = fromLonLat([21.0067, 52.2318], PROJECTION);
    expect(e).toBeCloseTo(637000, -2);
    expect(n).toBeCloseTo(486980, -2);
    const [lon, lat] = toLonLat([e, n], PROJECTION);
    expect(lon).toBeCloseTo(21.0067, 4);
    expect(lat).toBeCloseTo(52.2318, 4);
  });

  it('keeps the whole country inside the projection extent', () => {
    const [minX, minY, maxX, maxY] = PROJECTION.getExtent();
    expect(HOME_EXTENT[0]).toBeGreaterThan(minX);
    expect(HOME_EXTENT[1]).toBeGreaterThan(minY);
    expect(HOME_EXTENT[2]).toBeLessThan(maxX);
    expect(HOME_EXTENT[3]).toBeLessThan(maxY);
  });

  it('converts scales to resolutions in metres', () => {
    expect(scaleToResolution(10000)).toBeCloseTo(2.8, 6);
    expect(resolutionToScale(2.8)).toBeCloseTo(10000, 6);
  });

  it('finds the zoom level closest to a scale', () => {
    expect(zoomForScale(1000)).toBe(14);
    expect(zoomForScale(5000)).toBe(12);
    expect(zoomForScale(500)).toBe(15);
    expect(zoomForScale(1e9)).toBe(0);
  });
});

describe('GUGiK tile series', () => {
  it('has 17 levels from 1:30 238 156 to 1:236 with the three 2.5x steps of the capabilities', () => {
    const scales = RESOLUTIONS.map((r) => r / OGC_PIXEL);
    expect(scales).toHaveLength(17);
    expect(scales[0]).toBeCloseTo(30238155.7143, 3);
    expect(scales[16]).toBeCloseTo(236.2356, 3);
    const ratios = scales.slice(1).map((s, i) => scales[i] / s);
    expect(ratios.filter((r) => Math.abs(r - 2.5) < 0.001)).toHaveLength(3);
    expect(ratios.filter((r) => Math.abs(r - 2) < 0.001)).toHaveLength(13);
  });

  it('builds a WMTS grid for a service starting at a later level', () => {
    const grid = sharedWmtsGrid(2, 13);
    expect(grid.getResolutions()).toEqual(RESOLUTIONS.slice(2, 15));
    expect(grid.getMatrixIds()).toEqual(Array.from({ length: 13 }, (_, i) => `EPSG:2180:${i}`));
    expect(grid.getOrigin(0)).toEqual([100000, 850000]);
    expect(grid.getTileSize(0)).toBe(512);
  });
});
