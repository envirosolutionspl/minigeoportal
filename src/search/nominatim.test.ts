import { describe, expect, it } from 'vitest';
import { toSearchHit } from './nominatim';

describe('toSearchHit', () => {
  it('shows a building as a point in the map system, named first and placed after', () => {
    const hit = toSearchHit({
      label: 'Pałac Kultury i Nauki, Śródmieście, Warszawa, Polska',
      point: [21.0067, 52.2318],
      bbox: [21.0045, 52.2305, 21.009, 52.233],
      type: 'building',
    });
    expect(hit).toMatchObject({ kind: 'address', label: 'Pałac Kultury i Nauki', detail: 'Śródmieście, Warszawa, Polska' });
    expect(hit.center![0]).toBeCloseTo(637000, -2);
    expect(hit.extent).toBeUndefined();
  });

  it('shows a town whole', () => {
    const hit = toSearchHit({ label: 'Kraków, Polska', point: [19.94, 50.06], bbox: [19.79, 49.97, 20.22, 50.13], type: 'city' });
    expect(hit.kind).toBe('place');
    expect(hit.center).toBeUndefined();
    expect(hit.extent![2] - hit.extent![0]).toBeGreaterThan(20000);
  });
});
