import { describe, expect, it } from 'vitest';
import { parseCoordinates } from './coordinates';

describe('parseCoordinates', () => {
  it('reads latitude and longitude with decimal points or commas', () => {
    for (const q of ['52.2318, 21.0067', '52.2318 21.0067', '52,2318 21,0067', '52,2318; 21,0067']) {
      const hit = parseCoordinates(q)!;
      expect(hit.kind).toBe('point');
      expect(hit.center![0]).toBeCloseTo(637000, -2);
      expect(hit.center![1]).toBeCloseTo(486980, -2);
    }
  });

  it('reads PL-1992 as surveyors write it, X (northing) first', () => {
    expect(parseCoordinates('486980 637000')?.center).toEqual([637000, 486980]);
    expect(parseCoordinates('486980.5, 637000.25')?.label.replace(/\s/g, ' ')).toMatch(/^PL-1992 X 486 981, Y 637 000 · 52,2/);
  });

  it('leaves everything else to the search provider', () => {
    for (const q of ['Warszawa', 'Długa 5', '146510_8.0309.24/35', '12', '100 200', '52.2 21.0 3']) {
      expect(parseCoordinates(q)).toBeUndefined();
    }
  });
});
