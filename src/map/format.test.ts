import { describe, expect, it } from 'vitest';
import { fromLonLat } from 'ol/proj';
import '@/map/projection';
import { coordinateBar, coordinateTexts, dateText, directionsUrl, formatArea, formatCoordinate, formatLength } from './format';
import { parseCoordinates } from '@/search/coordinates';

// Intl in pl-PL groups with a narrow no-break space; compare with plain spaces.
const plain = (s: string) => s.replace(/\s/g, ' ');

describe('formatCoordinate', () => {
  it('writes PL-1992 as X = northing, Y = easting, followed by WGS 84', () => {
    const c = fromLonLat([21, 52], 'EPSG:2180');
    const text = plain(formatCoordinate(c));
    expect(text).toMatch(/^PL-1992 X \d{3} \d{3}, Y \d{3} \d{3} · 52,00000° N, 21,00000° E$/);
    expect(text).toContain(`X ${Math.round(c[1]).toLocaleString('pl-PL').replace(/\s/g, ' ')}`);
  });
});

describe('formatLength', () => {
  it('uses metres below a kilometre and kilometres above', () => {
    expect(formatLength(12.34)).toBe('12,3 m');
    expect(formatLength(1234)).toBe('1,23 km');
  });
});

describe('formatArea', () => {
  it('uses m², hectares with m², then km²', () => {
    expect(plain(formatArea(850))).toBe('850 m²');
    expect(plain(formatArea(12500))).toBe('1,25 ha (12 500 m²)');
    expect(plain(formatArea(2_500_000))).toBe('2,50 km²');
  });
});

describe('dateText', () => {
  it('writes an ISO date the Polish way', () => {
    expect(dateText('2025-04-27')).toBe('27.04.2025');
  });
});

describe('coordinateBar', () => {
  it('puts each system and value in its own box, with digits only from the point', () => {
    const html = coordinateBar(fromLonLat([21, 52], 'EPSG:2180')).replace(/\s/g, ' ');
    const el = document.createElement('div');
    el.innerHTML = html;
    expect([...el.querySelectorAll('.mp-system')].map((s) => s.querySelector('b')?.textContent)).toEqual(['PL-1992', 'WGS 84']);
    expect(el.textContent).toMatch(/^PL-1992X \d{3} \d{3}Y \d{3} \d{3}WGS 8452,00000° N21,00000° E$/);
  });
});

describe('coordinateTexts', () => {
  it('copies PL-1992 as X (northing), Y with centimetres and WGS 84 as latitude, longitude, which the search reads back', () => {
    const point = fromLonLat([21.0067, 52.2318], 'EPSG:2180');
    const { system, wgs84 } = coordinateTexts(point);
    expect(system).toMatch(/^\d{6}\.\d{2}, \d{6}\.\d{2}$/);
    expect(wgs84).toBe('52.231800, 21.006700');
    for (const text of [system, wgs84]) {
      const hit = parseCoordinates(text)!;
      expect(hit.center![0]).toBeCloseTo(point[0], 0);
      expect(hit.center![1]).toBeCloseTo(point[1], 0);
    }
  });

  it('leads Google Maps to the same latitude and longitude', () => {
    expect(directionsUrl(fromLonLat([21.0067, 52.2318], 'EPSG:2180'))).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=52.231800%2C21.006700',
    );
  });
});
