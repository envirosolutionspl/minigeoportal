import { LineString } from 'ol/geom';
import { getLength } from 'ol/sphere';
import { PROJECTION } from './projection';

/**
 * The profile of the terrain along a measured line: heights at evenly spaced points (from a
 * module's elevation model) and what they add up to.
 */

/** Most stretches of a profile: 101 heights draw a smooth line and are one light request. */
const MAX_STEPS = 100;

export interface ProfileSample {
  coordinate: [number, number];
  /** Metres along the line on the ground, as the measurement counts them. */
  distance: number;
}

/** Points along a line, at most a metre apart (the elevation model's grid) and at most MAX_STEPS stretches. */
export function profileSamples(line: [number, number][]): ProfileSample[] {
  const geometry = new LineString(line);
  const length = getLength(geometry, { projection: PROJECTION });
  if (!(length > 0)) return [];
  const steps = Math.min(MAX_STEPS, Math.ceil(length));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    coordinate: geometry.getCoordinateAt(i / steps) as [number, number],
    distance: (length * i) / steps,
  }));
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
  };
}
