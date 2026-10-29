import { describe, expect, it } from 'vitest';
import Feature from 'ol/Feature';
import WKT from 'ol/format/WKT';
import { Polygon } from 'ol/geom';
import { perimeterOf, sideLabels, sides } from './sides';
import { scaleToResolution } from './projection';

const wkt = new WKT();
const square = wkt.readGeometry('POLYGON((600000 500000,600100 500000,600100 500100,600000 500100,600000 500000))');

describe('sides', () => {
  it('measures every side of a parcel on the ellipsoid: its length in PL-1992 over the scale of the projection there', () => {
    const found = sides(square);
    expect(found).toHaveLength(4);
    // 100 km east of the central meridian PL-1992 draws lengths at 0.99942 (0.9993 · (1 + y² / 2R²)).
    for (const { length } of found) expect(length).toBeCloseTo(100.058, 2);
    expect(perimeterOf(square)).toBeCloseTo(400.231, 2);
  });

  it('takes every polygon of a multipolygon and the holes, and leaves out outlines of too many corners', () => {
    const two = wkt.readGeometry(
      'MULTIPOLYGON(((600000 500000,600010 500000,600010 500010,600000 500000)),((600100 500000,600110 500000,600110 500010,600100 500000)))',
    );
    expect(sides(two)).toHaveLength(6);
    const ring = Array.from({ length: 300 }, (_, i) => [600000 + 100 * Math.cos(i / 50), 500000 + 100 * Math.sin(i / 50)]);
    const many = new Polygon([[...ring, ring[0]]]);
    expect(sides(many)).toEqual([]);
    // The perimeter is still measured: 300 steps of 2 m around a circle of 100 m, and the closing side.
    expect(perimeterOf(many)).toBeGreaterThan(590);
  });

  it('labels the sides up close only, with the lengths, built once per feature', () => {
    const feature = new Feature(square);
    expect(sideLabels(feature, scaleToResolution(10000))).toEqual([]);
    const labels = sideLabels(feature, scaleToResolution(1000));
    expect(labels.map((s) => s.getText()?.getText())).toEqual(['100,1 m', '100,1 m', '100,1 m', '100,1 m']);
    expect(sideLabels(feature, scaleToResolution(500))).toBe(labels);
  });
});
