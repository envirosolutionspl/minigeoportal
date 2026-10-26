import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Read from disk (tests run from the project root): the test setup does not load stylesheets (css: false).
const css = withoutComments(readFileSync(resolve('src/index.css'), 'utf8'));

/** jsdom does not apply the stylesheet, so the high-contrast rules are checked in its text: every block for the selector. */
const rules = (selector: string) =>
  css
    .split('}')
    .filter((block) =>
      block
        .split('{')[0]
        .split(',')
        .some((s) => s.trim() === selector),
    )
    .join('}');

describe('dark mode', () => {
  it('gives the bottom bar the surface colour, not the white background OpenLayers gives open credits', () => {
    expect(rules('.ol-attribution:not(.ol-collapsed)')).toContain('background: color-mix(in srgb, var(--surface)');
  });
});

describe('high contrast theme', () => {
  it('turns the author credit, which has fixed light colours, yellow on black', () => {
    const credit = rules("html[data-contrast='high'] .author-credit");
    expect(credit).toContain('background: #000000');
    expect(credit).toContain('color: #ffff00');
  });
});

/** Colour variables of one block of a skin: `--name: #rrggbb`. */
const tokens = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));

/** WCAG 2.1 relative luminance and contrast ratio. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Text colours and the backgrounds they appear on: each pair needs 4.5:1 (WCAG 2.1 AA, 1.4.3). */
const PAIRS = [
  ['text', 'surface'],
  ['text', 'field'],
  ['muted', 'surface'],
  ['muted', 'field'],
  ['accent', 'surface'],
  ['accent', 'field'],
  ['on-accent', 'accent'],
  ['danger', 'surface'],
  ['danger', 'danger-soft'],
  ['highlight-ui', 'surface'],
  ['highlight-ui', 'field'],
];

describe.each(readdirSync('skins'))('skin %s', (name) => {
  const skin = withoutComments(readFileSync(join('skins', name, 'skin.css'), 'utf8'));
  const [light, dark = ''] = skin.split(/@media\s*\(prefers-color-scheme:\s*dark\)/);
  const modes = { light: tokens(light), dark: { ...tokens(light), ...tokens(dark) } };

  it.each(Object.entries(modes))('keeps text readable in %s mode', (_, colours) => {
    for (const [fg, bg] of PAIRS) {
      expect(colours[fg], `--${fg}`).toBeDefined();
      expect(contrast(colours[fg], colours[bg]), `--${fg} on --${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
