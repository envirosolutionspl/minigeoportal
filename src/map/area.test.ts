import { describe, expect, it } from 'vitest';
import { Polygon } from 'ol/geom';
import { getArea } from 'ol/sphere';
import { areaOf } from './area';
import { PROJECTION } from './projection';

/** A square with the given side in PL-1992 metres, its corner at the point. */
const square = (x: number, y: number, side: number) =>
  new Polygon([
    [
      [x, y],
      [x + side, y],
      [x + side, y + side],
      [x, y + side],
      [x, y],
    ],
  ]);

describe('areaOf', () => {
  it('gives the area on the ellipsoid: on the central meridian, the plane area over the scale factor squared', () => {
    // PL-1992 shrinks lengths by 0.9993 on 19° E: a 100 m square on the map is 10 014 m² on the ground.
    expect(areaOf(square(500000, 500000, 100))).toBeCloseTo(10000 / 0.9993 ** 2, 0);
  });

  it('measures more than the default sphere of OpenLayers, which in Poland falls short by about 0.4 %', () => {
    const field = square(640000, 480000, 300);
    const short = 1 - getArea(field, { projection: PROJECTION }) / areaOf(field);
    expect(short).toBeGreaterThan(0.003);
    expect(short).toBeLessThan(0.006);
  });
});
