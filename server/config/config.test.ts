import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './load.ts';
import { clientConfig, creditHtml, textIn } from './client.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A copy of the default configuration with one file edited. */
function broken(file: string, edit: (source: string) => string): string {
  const dir = mkdtempSync(join(tmpdir(), 'config-'));
  dirs.push(dir);
  cpSync('config', dir, { recursive: true });
  writeFileSync(join(dir, file), edit(readFileSync(join(dir, file), 'utf8')));
  return dir;
}

const problems = (dir: string) => {
  try {
    loadConfig(dir);
    return [];
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    return e.problems;
  }
};

describe('default configuration', () => {
  const config = clientConfig(loadConfig('config'), 'pl');

  it('stays what the app was built with (any change shows up here)', () => {
    expect(config).toMatchSnapshot();
  });

  it('keeps the first view, the search and the modules', () => {
    expect(config.app).toMatchObject({ name: 'Prosty Geoportal', storagePrefix: 'prostygeoportal.' });
    expect(config.map.attribution).toBe(
      'Dane: <a href="https://www.geoportal.gov.pl" target="_blank" rel="noopener">GUGiK, geoportal.gov.pl</a>',
    );
    expect(config.layers.drawOrder).toEqual(['suikzp', 'kimpzp', 'pog', 'kibdot', 'kiut', 'kieg', 'rcn', 'kina', 'prg']);
    expect(config.map.view).toMatchObject({ center: [500000, 465000], zoom: 3, base: 'mapa', baseMobile: 'prosta', overlays: ['kieg'] });
    expect(config.map.view.home).toEqual([170000, 130000, 870000, 800000]);
    expect(config.search).toEqual({ provider: 'gugik', parcel: true });
    expect(config.modules.gugik).toEqual({ catalog: true, drawOrder: true, ortho: true, parcelReport: true });
  });
});

describe('loadConfig', () => {
  it('reports each problem with its file, line and column', () => {
    const dir = broken('map.yaml', (s) => s.replace('    format: image/jpeg', '    format: jpeg'));
    expect(problems(dir)[0]).toMatch(/^map\.yaml:\d+:\d+ tileServices\.0\.format: /);
  });

  it('refuses unknown keys and anything that looks like a secret', () => {
    const dir = broken('layers.yaml', (s) => s.replace('  - id: kieg\n', '  - id: kieg\n    apiKey: abc\n'));
    expect(problems(dir).join('\n')).toMatch(/overlays\.0\.apiKey: secrets belong in environment variables/);
    expect(problems(dir).join('\n')).toMatch(/Unrecognized key: "apiKey"/);
  });

  it('checks ids used across the files', () => {
    const dir = broken('map.yaml', (s) =>
      s.replace('  base: mapa', '  base: mapka').replace('  overlays: [kieg]', '  overlays: [kieg, nic]'),
    );
    const found = problems(dir).join('\n');
    expect(found).toMatch(/map\.yaml:\d+:\d+ view\.base: unknown base map "mapka"/);
    expect(found).toMatch(/unknown overlay "nic"/);
  });

  it('needs the gugik module for the GUGiK search and the parcel search', () => {
    const dir = broken('app.yaml', (s) => s.replace('    enabled: true', '    enabled: false'));
    const found = problems(dir).join('\n');
    expect(found).toMatch(/search\.provider gugik needs modules\.gugik\.enabled/);
    expect(found).toMatch(/search\.parcel needs modules\.gugik\.enabled/);
  });

  it('says which file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'config-'));
    dirs.push(dir);
    expect(problems(dir)).toContain('app.yaml: file not found');
  });
});

describe('texts and credits', () => {
  it('picks the language, then the default one', () => {
    expect(textIn('Mapa', 'en', 'pl')).toBe('Mapa');
    expect(textIn({ pl: 'Mapa', en: 'Map' }, 'en', 'pl')).toBe('Map');
    expect(textIn({ pl: 'Mapa' }, 'de', 'pl')).toBe('Mapa');
  });

  it('turns Markdown links into safe links and escapes the rest', () => {
    expect(creditHtml('Dane: [OSM](https://www.openstreetmap.org/copyright) <b>')).toBe(
      'Dane: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a> &lt;b&gt;',
    );
    expect(creditHtml('[x](javascript:alert(1))')).toBe('[x](javascript:alert(1))');
  });
});
