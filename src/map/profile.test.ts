import { describe, expect, it } from 'vitest';
import { profileOf, profileSamples, type ProfileSample } from './profile';

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
    // The bend falls on an even sample here: one sample, marked.
    expect(samples[50]).toMatchObject({ coordinate: [601000, 500000], bend: true });
    expect(samples.filter((s) => s.bend)).toHaveLength(1);
  });

  it('adds the bends of the line between the even samples, in order', () => {
    const samples = profileSamples([
      [600000, 500000],
      [600333, 500000],
      [600333, 500667],
    ]);
    // The bend takes the place of the even sample nearest to it.
    expect(samples).toHaveLength(101);
    const bend = samples.findIndex((s) => s.bend);
    expect(samples[bend].coordinate).toEqual([600333, 500000]);
    expect(samples[bend - 1].distance).toBeLessThan(samples[bend].distance);
    expect(samples[bend + 1].distance).toBeGreaterThan(samples[bend].distance);
    expect(samples[bend + 1].distance - samples[bend].distance).toBeGreaterThan(5);
    expect(samples[bend].distance / samples[100].distance).toBeCloseTo(1 / 3, 3);
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

  it('finds the steepest stretch and the mean slope along the line', () => {
    const profile = profileOf(at(0, 10, 20, 30), [100, 105, 103, 104])!;
    expect(profile).toMatchObject({ length: 30, min: 100, max: 105 });
    expect(profile.slope).toBeCloseTo(0.5, 6);
    // 5 up, 2 down and 1 up over 30 m.
    expect(profile.meanSlope).toBeCloseTo(8 / 30, 6);
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

  it('gives the heights at the bends, or none where the model has none', () => {
    const samples: ProfileSample[] = at(0, 10, 20, 30);
    samples[1] = { ...samples[1], bend: true };
    samples[2] = { ...samples[2], bend: true };
    expect(profileOf(samples, [100, 104, null, 110])!.bends).toEqual([
      { distance: 10, height: 104 },
      { distance: 20, height: null },
    ]);
  });
});
