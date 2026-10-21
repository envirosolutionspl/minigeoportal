import { describe, expect, it } from 'vitest';
import { BASE_MAPS, OVERLAYS, OVERLAY_BY_ID, TILE_SERVICES, TILE_SERVICE_BY_ID, defaultSublayers, selectedSublayers } from './registry';

describe('registry invariants', () => {
  it('has unique ids within tile services and within everything the URL names (base maps and overlays)', () => {
    const tiles = TILE_SERVICES.map((s) => s.id);
    expect(new Set(tiles).size).toBe(tiles.length);
    const named = [...BASE_MAPS, ...OVERLAYS].map((s) => s.id);
    expect(new Set(named).size).toBe(named.length);
  });

  it('references only existing tile services from base maps, with thumbnails for drawn ones', () => {
    for (const base of BASE_MAPS) {
      for (const src of base.sources) expect(TILE_SERVICE_BY_ID.has(src.service)).toBe(true);
      if (base.sources.length > 0) expect(base.thumb).toMatch(/^\/thumbs\/.+\.jpg$/);
    }
  });

  it('uses https URLs on GUGiK hosts only', () => {
    for (const s of [...TILE_SERVICES, ...OVERLAYS]) expect(s.url).toMatch(/^https:\/\/[a-z0-9.]+\.(gugik\.gov\.pl|geoportal\.gov\.pl)\//);
  });

  it('gives every overlay unique sublayer names and at least one default', () => {
    for (const o of OVERLAYS) {
      const names = o.sublayers.map((l) => l.name);
      expect(new Set(names).size).toBe(names.length);
      expect(defaultSublayers(o).length).toBeGreaterThan(0);
    }
  });
});

describe('selectedSublayers', () => {
  const kieg = OVERLAY_BY_ID.get('kieg')!;

  it('returns the defaults when nothing is customised', () => {
    expect(selectedSublayers(kieg, {})).toEqual(['obreby', 'dzialki', 'budynki', 'numery_dzialek']);
  });

  it('keeps drawing order and drops unknown names from a custom selection', () => {
    expect(selectedSublayers(kieg, { kieg: ['numery_dzialek', 'nope', 'uzytki'] })).toEqual(['uzytki', 'numery_dzialek']);
  });
});
