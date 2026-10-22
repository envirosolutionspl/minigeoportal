import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read from disk (tests run from the project root): the test setup does not load stylesheets (css: false).
const css = readFileSync(resolve('src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

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

describe('high contrast theme', () => {
  it('turns the author credit, which has fixed light colours, yellow on black', () => {
    const credit = rules("html[data-contrast='high'] .author-credit");
    expect(credit).toContain('background: #000000');
    expect(credit).toContain('color: #ffff00');
  });
});
