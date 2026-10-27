import { describe, expect, it } from 'vitest';
import { blankPixels } from './blank';

const pixels = (...rgba: number[][]) => rgba.flat();

describe('blankPixels', () => {
  it('finds an image white all over, or transparent all over', () => {
    expect(blankPixels(pixels([255, 255, 255, 255], [254, 255, 255, 255]))).toBe(true);
    expect(blankPixels(pixels([0, 0, 0, 0], [12, 40, 7, 0]))).toBe(true);
  });

  it('takes any drawn pixel for a picture', () => {
    expect(blankPixels(pixels([255, 255, 255, 255], [240, 238, 230, 255]))).toBe(false);
    expect(blankPixels(pixels([0, 0, 0, 0], [0, 0, 0, 128]))).toBe(false);
    // White over half and transparent over the rest is a sheet's edge, not a blank image.
    expect(blankPixels(pixels([255, 255, 255, 255], [0, 0, 0, 0]))).toBe(false);
  });
});
