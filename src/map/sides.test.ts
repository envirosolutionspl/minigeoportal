import { describe, expect, it } from 'vitest';
import Feature from 'ol/Feature';
import WKT from 'ol/format/WKT';
import { Polygon } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import { lengthOf, perimeterOf, sideLabels, sides } from './sides';
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

  it('measures lines on the ellipsoid to a centimetre a kilometre, against the geodesic from proj4 and Vincenty’s formula', () => {
    // The ends taken to degrees with proj4, the geodesic between them on GRS80 by Vincenty's inverse formula.
    // A degree of the meridian at 20° E, from 51.5° to 52.5° N: 111 267.347 m (OpenLayers' sphere: 111 195.1 m).
    expect(lengthOf([fromLonLat([20, 51.5], 'EPSG:2180'), fromLonLat([20, 52.5], 'EPSG:2180')])).toBeCloseTo(111267.347, 0);
    // 50 km aslant: 50 026.091 m, within five centimetres.
    expect(
      lengthOf([
        [600000, 500000],
        [640000, 530000],
      ]),
    ).toBeCloseTo(50026.091, 1);
    // 600 km west to east across the country, taken in pieces: 600 199.092 m, within half a metre (from the radii at the middle alone: +370 m).
    expect(
      lengthOf([
        [200000, 500000],
        [800000, 500000],
      ]),
    ).toBeCloseTo(600199.092, 0);
    // A kilometre east, then north, 200 km east of the central meridian: 1000.206 m and 1000.204 m (the sphere: 997.1 m east).
    expect(
      lengthOf([
        [700000, 300000],
        [701000, 300000],
        [701000, 301000],
      ]),
    ).toBeCloseTo(1000.206 + 1000.204, 2);
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
