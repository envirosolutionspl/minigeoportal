import { describe, expect, it } from 'vitest';
import { config, defaultSublayers, overlayById, selectedSublayers } from './runtime';

const { baseMaps, tileServices } = config.map;
const { overlays } = config.layers;

describe('default configuration', () => {
  it('has unique ids across everything the URL names (base maps and overlays)', () => {
    const named = [...baseMaps, ...overlays].map((s) => s.id);
    expect(new Set(named).size).toBe(named.length);
  });

  it('gives drawn base maps thumbnails', () => {
    for (const base of baseMaps) if (base.sources.length > 0) expect(base.thumb).toMatch(/^\/thumbs\/.+\.jpg$/);
  });

  it('uses https URLs on GUGiK hosts only', () => {
    for (const s of [...tileServices, ...overlays]) expect(s.url).toMatch(/^https:\/\/[a-z0-9.]+\.(gugik\.gov\.pl|geoportal\.gov\.pl)\//);
  });

  it('gives every overlay unique sublayer names and at least one default', () => {
    for (const o of overlays) {
      const names = o.sublayers.map((l) => l.name);
      expect(new Set(names).size).toBe(names.length);
      expect(defaultSublayers(o).length).toBeGreaterThan(0);
    }
  });
});

describe('selectedSublayers', () => {
  const kieg = overlayById.get('kieg')!;

  it('returns the defaults when nothing is customised', () => {
    expect(selectedSublayers(kieg, {})).toEqual(['obreby', 'dzialki', 'budynki', 'numery_dzialek']);
  });

  it('keeps drawing order and drops unknown names from a custom selection', () => {
    expect(selectedSublayers(kieg, { kieg: ['numery_dzialek', 'nope', 'uzytki'] })).toEqual(['uzytki', 'numery_dzialek']);
  });
});
