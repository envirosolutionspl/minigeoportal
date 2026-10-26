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

describe('keyboard focus', () => {
  it('reaches the search and the tools before the map and its buttons (focus order follows the screen)', () => {
    const app = source('src/App.tsx');
    expect(app.indexOf('<TopBar />')).toBeLessThan(app.indexOf('<MapView />'));
  });

  it('shows on the OpenLayers buttons as on every other button, instead of the outline OpenLayers hides', () => {
    expect(css).not.toMatch(/\.ol-control button:focus\s*\{[^}]*outline:\s*none/);
    expect(css).toMatch(/\.ol-control button:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--accent\)/);
  });
});

describe('small print', () => {
  it('keeps the bottom bar, the scale bar and the labels at 11 px or more', () => {
    expect(css).not.toMatch(/font-size:\s*0\.(6\d*|70*)rem/);
    expect(source('src/ui/BasemapSwitcher.tsx')).not.toContain('text-[10px]');
    expect(source('src/ui/Brand.tsx')).not.toContain('text-[10px]');
  });
});

describe('phone screens', () => {
  it('gives the place panel the whole height, over the screen upright and at the left side sideways', () => {
    expect(source('src/ui/InfoPanel.tsx')).toContain('className="info-panel ');
    expect(css).toMatch(
      /@media \(max-width: 639px\), \(max-height: 500px\)\s*\{\s*\.info-panel\s*\{\s*inset:\s*0;\s*z-index:\s*40;[^}]*max-height:\s*none;[^}]*padding-top:\s*env\(safe-area-inset-top\)/,
    );
    expect(css).toMatch(/@media \(min-width: 640px\) and \(max-height: 500px\)\s*\{\s*\.info-panel\s*\{\s*right:\s*auto;\s*width:\s*24rem/);
    // Sideways, the search bar moves out from under the panel.
    expect(css).toMatch(/\[data-panel\]:has\(> \.info-panel\) \.search-box\s*\{\s*margin-left:\s*24rem/);
    // The layer list makes way for it on a phone held either way, not only upright.
    expect(source('src/map/featureInfoClick.ts')).toContain("matchMedia?.('(max-width: 639px), (max-height: 500px)')");
  });

  it('keeps the scale at the right of the bar on a phone held sideways, beside the layer list when it is open', () => {
    const sideways = css.slice(css.indexOf('@media (max-height: 500px) {'));
    expect(sideways).toMatch(/\[data-panel='catalog'\] \.map-status\s*\{\s*left:\s*auto;\s*right:\s*0\.75rem;\s*transform:\s*none/);
    expect(css).toMatch(
      /@media \(min-width: 640px\) and \(max-height: 500px\)\s*\{\s*\[data-panel='catalog'\] \.map-status\s*\{\s*right:\s*calc\(24rem \+ 0\.75rem\)/,
    );
  });

  it('stops the chrome growing past 125 % text, so the search field and buttons fit with the text at 200 %', () => {
    expect(css).toMatch(/@media \(max-width: 639px\)\s*\{\s*:root\s*\{\s*--spacing:\s*min\(0\.25rem,\s*5px\)/);
    expect(css).toMatch(/\.map-tools\s*\{\s*top:\s*min\(4\.25rem,\s*85px\)/);
    expect(css).toMatch(/\.ol-control button\s*\{\s*width:\s*min\(2\.5rem,\s*50px\)/);
  });

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

  it('runs the bottom bar the full width, not 1.3em short of the edge as OpenLayers does', () => {
    expect(css).toMatch(/\.ol-attribution:not\(\.ol-collapsed\)\s*\{[^}]*left:\s*0;[^}]*right:\s*0;[^}]*max-width:\s*none/);
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

  it('shows the hand cursor over buttons, which Tailwind 4 gives the arrow', () => {
    expect(css).toMatch(/button:not\(:disabled\),\s*\[role='button'\]:not\(:disabled\)\s*\{\s*cursor:\s*pointer/);
  });

  it('keeps the parcel search and the search results within the screen, scrolling them on a phone held sideways', () => {
    expect(source('src/modules/gugik/ParcelSearch.tsx')).toMatch(/max-h-\[calc\(100dvh-5rem\)\] overflow-y-auto/);
    expect(source('src/ui/TopBar.tsx')).toMatch(/id="search-results"[\s\S]*?max-h-\[calc\(100dvh-5rem\)\] overflow-y-auto/);
  });

  it('draws the top bar, with the parcel form, above the base map switcher', () => {
    // z-[35] over z-30: on a phone held sideways the parcel form reaches down to the switcher.
    expect(source('src/ui/TopBar.tsx')).toContain('className="pointer-events-none absolute inset-x-0 top-0 z-[35]');
    expect(source('src/ui/BasemapSwitcher.tsx')).toMatch(/className="group pointer-events-auto absolute [^"]* z-30 /);
  });

  it('opens the layer list over the whole screen of a phone, below the status bar', () => {
    const aside = /<aside[\s\S]*?className=\{`([^`]*)`\}/.exec(source('src/App.tsx'))![1];
    expect(aside).toMatch(/inset-0 pt-\[env\(safe-area-inset-top\)\] pb-\[var\(--safe-bottom\)\]/);
    expect(aside).not.toMatch(/h-\[\d+dvh\]/);
  });

  it('puts the layer filters in one row that scrolls sideways on a phone', () => {
    expect(source('src/ui/LayerCatalog.tsx')).toMatch(/phone:flex-nowrap phone:overflow-x-auto/);
  });

  it('opens the More sheet like the layer list: the whole screen upright, the right side sideways', () => {
    const sheet = source('src/ui/MoreSheet.tsx');
    expect(sheet).toMatch(/more-sheet [^"]* m-0 h-dvh max-h-none w-full max-w-none [^"]*sm:ml-auto sm:w-96/);
    expect(css).toMatch(/\.more-sheet\[open\]\s*\{\s*animation: sheet-up/);
  });

  it('draws the open search above the tool buttons', () => {
    expect(source('src/ui/TopBar.tsx')).toMatch(/search-box[^"]*\bz-10\b/);
  });
});
