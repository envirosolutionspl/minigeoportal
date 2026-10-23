import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Source files, without tests and without the modules themselves. */
function core(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name).replace(/\\/g, '/');
    if (e.isDirectory()) return /\/modules\/gugik$/.test(path) ? [] : core(path);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
  });
}

describe('module boundary', () => {
  it('lets only the registries import a module', () => {
    const importers = ['server', 'shared', 'src']
      .flatMap(core)
      .filter((f) => /from '[^']*\/gugik(\/[^']*)?'/.test(readFileSync(f, 'utf8')));
    expect(importers.sort()).toEqual(['server/modules/index.ts', 'src/modules/index.ts']);
  });
});
