import { describe, expect, it } from 'vitest';
import { preloadTags } from '../../scripts/preload.ts';

/** What a build gives: the chunks of vite.config.ts and main.tsx, the stylesheet, every subset of the font. */
const BUNDLE = {
  'assets/index-1.js': { type: 'chunk' as const, fileName: 'assets/index-1.js', name: 'index' },
  'assets/vendor-2.js': { type: 'chunk' as const, fileName: 'assets/vendor-2.js', name: 'vendor' },
  'assets/App-3.js': { type: 'chunk' as const, fileName: 'assets/App-3.js', name: 'App' },
  'assets/ol-4.js': { type: 'chunk' as const, fileName: 'assets/ol-4.js', name: 'ol' },
  'assets/index-5.css': { type: 'asset' as const, fileName: 'assets/index-5.css' },
  'assets/figtree-cyrillic-wght-normal-6.woff2': { type: 'asset' as const, fileName: 'assets/figtree-cyrillic-wght-normal-6.woff2' },
  'assets/figtree-latin-wght-normal-7.woff2': { type: 'asset' as const, fileName: 'assets/figtree-latin-wght-normal-7.woff2' },
  'assets/figtree-latin-ext-wght-normal-8.woff2': { type: 'asset' as const, fileName: 'assets/figtree-latin-ext-wght-normal-8.woff2' },
};

describe('preloadTags', () => {
  it('preloads the map library and the app, then the Latin fonts, and nothing Vite links itself', () => {
    const tags = preloadTags(BUNDLE);
    expect(tags.map((t) => [t.attrs?.rel, t.attrs?.href])).toEqual([
      ['modulepreload', '/assets/ol-4.js'],
      ['modulepreload', '/assets/App-3.js'],
      ['preload', '/assets/figtree-latin-wght-normal-7.woff2'],
      ['preload', '/assets/figtree-latin-ext-wght-normal-8.woff2'],
    ]);
    expect(tags.every((t) => t.tag === 'link' && t.injectTo === 'head' && t.attrs?.crossorigin === true)).toBe(true);
    expect(tags[2].attrs).toMatchObject({ as: 'font', type: 'font/woff2' });
  });

  it('puts the links under the base the site is served from', () => {
    expect(preloadTags(BUNDLE, '/mapa/')[0].attrs?.href).toBe('/mapa/assets/ol-4.js');
  });
});
