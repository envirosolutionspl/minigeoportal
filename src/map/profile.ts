import { LineString } from 'ol/geom';
import { getLength } from 'ol/sphere';
import { PROJECTION } from './projection';

/**
 * The profile of the terrain along a drawn line: heights at evenly spaced points and at the points
 * clicked where the line bends (from a module's elevation model), and what they add up to.
 */

/** Most stretches of a profile: 101 heights draw a smooth line and are one light request. */
const MAX_STEPS = 100;

export interface ProfileSample {
  coordinate: [number, number];
  /** Metres along the line on the ground, as the measurement counts them. */
  distance: number;
  /** A point clicked between the ends, where the line bends. */
  bend?: boolean;
}

/**
 * Points along a line, at most a metre apart (the elevation model's grid) and at most MAX_STEPS
 * stretches, and the bends among them, so the chart can show the height at each.
 */
export function profileSamples(line: [number, number][]): ProfileSample[] {
  const geometry = new LineString(line);
  const length = getLength(geometry, { projection: PROJECTION });
  if (!(length > 0)) return [];
  const steps = Math.min(MAX_STEPS, Math.ceil(length));
  // Where each bend lies along the line, as a share of it in the map's plane (as getCoordinateAt counts).
  const plane = geometry.getLength();
  let along = 0;
  const bends = line.slice(1, -1).map((point, i) => {
    along += Math.hypot(point[0] - line[i][0], point[1] - line[i][1]);
    return { share: along / plane, point };
  });
  // A bend takes the place of the even samples within half a stretch of it: a pair metres apart
  // would make a steep slope out of the model's noise.
  const even = Array.from({ length: steps + 1 }, (_, i) => i / steps).filter(
    (share, i) => i === 0 || i === steps || bends.every((b) => Math.abs(b.share - share) >= 0.5 / steps),
  );
  return [
    ...even.map((share) => ({ share, point: geometry.getCoordinateAt(share) as [number, number], bend: false })),
    ...bends.map((b) => ({ ...b, bend: true })),
  ]
    .sort((a, b) => a.share - b.share)
    .map(({ share, point, bend }) => ({ coordinate: point, distance: length * share, ...(bend ? { bend } : {}) }));
}

export interface Profile {
  /** The samples with a height, in order. */
  points: { distance: number; height: number }[];
  length: number;
  min: number;
  max: number;
  /** Metres climbed and descended walking the line. */
  ascent: number;
  descent: number;
  /** Steepest stretch between neighbouring samples, as a fraction (0.09 is 9 %). */
  slope: number;
  /** Samples the model has no height for (abroad, at sea). */
  missing: number;
  /** The bends of the line, with their heights where the model has them. */
  bends: { distance: number; height: number | null }[];
}

/** The profile of samples and their heights; none with fewer than two heights. */
export function profileOf(samples: ProfileSample[], heights: (number | null)[]): Profile | undefined {
  const points = samples.flatMap((s, i) => {
    const height = heights[i];
    return height === null || height === undefined ? [] : [{ distance: s.distance, height }];
  });
  if (points.length < 2) return undefined;
  let ascent = 0;
  let descent = 0;
  let slope = 0;
  for (let i = 1; i < points.length; i++) {
    const rise = points[i].height - points[i - 1].height;
    const run = points[i].distance - points[i - 1].distance;
    if (rise > 0) ascent += rise;
    else descent -= rise;
    if (run > 0) slope = Math.max(slope, Math.abs(rise) / run);
  }
  const all = points.map((p) => p.height);
  return {
    points,
    length: samples[samples.length - 1].distance,
    min: Math.min(...all),
    max: Math.max(...all),
    ascent,
    descent,
    slope,
    missing: samples.length - points.length,
    bends: samples.flatMap((s, i) => (s.bend ? [{ distance: s.distance, height: heights[i] ?? null }] : [])),
  };
}
