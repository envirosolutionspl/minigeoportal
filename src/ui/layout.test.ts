import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read from disk (tests run from the project root): the test setup does not load stylesheets (css: false).
const css = readFileSync(resolve('src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const source = (file: string) => readFileSync(resolve(file), 'utf8');

/** Every `bottom:` in the blocks whose selector names the class. */
const bottoms = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1].includes(selector))
    .flatMap((m) => [...m[2].matchAll(/bottom:\s*([^;]+);/g)].map((b) => b[1]));

describe('phone screens', () => {
  it.each(['.ol-zoom', '.ol-zoom-extent', '.ol-scale-line', '.map-status'])('keeps %s above the bar at the bottom', (selector) => {
    const values = bottoms(selector);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toContain('var(--safe-bottom)');
  });

  it('keeps the data credit, base maps and author credit above the bar', () => {
    expect(css).toMatch(/--safe-bottom:\s*env\(safe-area-inset-bottom/);
    expect(css).toMatch(/\.ol-attribution:not\(\.ol-collapsed\)\s*\{[^}]*padding:[^;]*var\(--safe-bottom\)/);
    expect(source('src/ui/BasemapSwitcher.tsx')).toContain('bottom-[calc(2.25rem+var(--safe-bottom))]');
    expect(source('src/ui/Brand.tsx')).toContain('bottom-[calc(1.75rem+var(--safe-bottom))]');
  });

  it('keeps the app clear of the notch on phones held sideways', () => {
    expect(source('index.html')).toContain('viewport-fit=cover');
    const app = source('src/App.tsx');
    expect(app).toContain('ml-[env(safe-area-inset-left)]');
    expect(app).toContain('mr-[env(safe-area-inset-right)]');
  });

  it('puts the tools in two columns on screens too short for one', () => {
    const short = /@media \(max-height: (\d+)px\)\s*\{\s*\.map-tools\s*\{[^}]*display:\s*grid/.exec(css);
    // A small phone upright in Safari shows about 630 px of the page.
    expect(Number(short?.[1])).toBeGreaterThanOrEqual(660);
  });

  it('leaves the whole-country button, scale bar and author credit off the map on phones', () => {
    const phone = /@media \(max-width: 639px\), \(max-height: 500px\)\s*\{([^{}]*)\{\s*display:\s*none/.exec(css)?.[1] ?? '';
    for (const selector of ['.ol-zoom-extent', '.ol-scale-line', '.author-credit']) expect(phone).toContain(selector);
    expect(css).toMatch(/@custom-variant phone\s*\{\s*@media \(max-width: 639px\), \(max-height: 500px\)/);
  });

  it('draws the open search above the tool buttons', () => {
    expect(source('src/ui/TopBar.tsx')).toMatch(/search-box[^"]*\bz-10\b/);
  });
});
