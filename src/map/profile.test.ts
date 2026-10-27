import { describe, expect, it } from 'vitest';
import { profileOf, profileSamples } from './profile';

describe('profileSamples', () => {
  it('spaces at most a hundred stretches along the line, from its start to its end', () => {
    const samples = profileSamples([
      [600000, 500000],
      [601000, 500000],
      [601000, 501000],
    ]);
    expect(samples).toHaveLength(101);
    expect(samples[0].coordinate).toEqual([600000, 500000]);
    expect(samples[100].coordinate).toEqual([601000, 501000]);
    expect(samples[50].coordinate[0]).toBeCloseTo(601000, 0);
    // The ground length, as the measurement counts it: about 2 km in PL-1992.
    expect(samples[100].distance).toBeGreaterThan(1990);
    expect(samples[100].distance).toBeLessThan(2010);
  });

  it('keeps samples a metre apart on short lines, and has none for a point', () => {
    expect(
      profileSamples([
        [600000, 500000],
        [600010, 500000],
      ]),
    ).toHaveLength(11);
    expect(
      profileSamples([
        [600000, 500000],
        [600000, 500000],
      ]),
    ).toEqual([]);
  });
});

describe('profileOf', () => {
  const at = (...distances: number[]) => distances.map((distance) => ({ coordinate: [0, 0] as [number, number], distance }));

  it('adds up the climb and descent and finds the steepest stretch', () => {
    const profile = profileOf(at(0, 10, 20, 30), [100, 105, 103, 104])!;
    expect(profile).toMatchObject({ length: 30, min: 100, max: 105, ascent: 6, descent: 2 });
    expect(profile.slope).toBeCloseTo(0.5, 6);
  });

  it('leaves out the points without a height, and needs two heights', () => {
    const profile = profileOf(at(0, 10, 20), [100, null, 110])!;
    expect(profile.points).toEqual([
      { distance: 0, height: 100 },
      { distance: 20, height: 110 },
    ]);
    expect(profile.slope).toBeCloseTo(0.5, 6);
    expect(profile.missing).toBe(1);
    expect(profileOf(at(0, 10), [100, null])).toBeUndefined();
  });
});
