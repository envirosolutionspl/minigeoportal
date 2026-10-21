import { describe, expect, it } from 'vitest';
import { LineString, Point, Polygon } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import '@/map/projection';
import { measure } from './measure';

const plain = (s?: string) => s?.replace(/\s/g, ' ');

describe('measure', () => {
  it('measures a line geodesically, close to its PL-1992 length', () => {
    expect(measure(new LineString([[600000, 500000], [601000, 500000]]))).toMatch(/^99\d,\d m$/);
  });

  it('gives the area and perimeter of a polygon', () => {
    // About 100 m × 100 m.
    const text = plain(measure(new Polygon([[[600000, 500000], [600100, 500000], [600100, 500100], [600000, 500100], [600000, 500000]]])));
    expect(text).toMatch(/^(99\d\d|1\d \d{3}) m²|^1(,\d+)? ha/);
    expect(text).toMatch(/obwód 39\d,\d m|obwód 400,\d m/);
  });

  it('agrees with the ellipsoid for a line in degrees', () => {
    // One degree of latitude near 52° N is about 111.3 km.
    const line = new LineString([fromLonLat([20, 51.5], 'EPSG:2180'), fromLonLat([20, 52.5], 'EPSG:2180')]);
    expect(measure(line)).toMatch(/^111,[23]\d km$/);
  });

  it('ignores other geometries', () => {
    expect(measure(new Point([0, 0]))).toBeUndefined();
  });
});
