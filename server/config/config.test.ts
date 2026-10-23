import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    // Texts of the interface have their own tests (i18n.test.ts).
    expect({ ...config, messages: undefined }).toMatchSnapshot();
  });

  it('keeps the first view, the search and the modules', () => {
    expect(config.app).toMatchObject({ name: 'MiniGeoportal', storagePrefix: 'minigeoportal.' });
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

describe('default configuration in English', () => {
  const en = clientConfig(loadConfig('config'), 'en');

  it('gives every text in English, the interface and the Markdown too', () => {
    expect(en.app).toMatchObject({ name: 'MiniGeoportal', tagline: 'Data from geoportal.gov.pl, simpler and faster' });
    expect(en.layers.overlays.find((o) => o.id === 'kieg')).toMatchObject({ title: 'Land and building register' });
    expect(en.layers.overlays.find((o) => o.id === 'kieg')?.keywords).toContain('parcels');
    expect(en.map.view.homeLabel).toBe('All of Poland');
    expect(en.report.categories[0].label).toBe('Map or layers');
    expect(en.content.welcome).toContain('<h2>What this service is for</h2>');
    expect(en.messages['common.close']).toBe('Close');
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

  it('keeps the gugik module to PL-1992 and WMTS services to a shared tile grid', () => {
    const found = problems(
      broken('map.yaml', (s) => s.replace('  code: EPSG:2180', '  code: EPSG:3857').replace(/tileGrid:\n( {2}.*\n)+/, '')),
    ).join('\n');
    expect(found).toMatch(/modules\.gugik needs map\.yaml projection EPSG:2180/);
    expect(found).toMatch(/WMTS service "orto" needs map\.yaml tileGrid/);
  });

  it('accepts XYZ tiles only with {z}, {x} and {y} in the address', () => {
    const xyz = (url: string) =>
      broken('map.yaml', (s) => s.replace('tileServices:\n', `tileServices:\n  - id: osm\n    kind: xyz\n    url: ${url}\n`));
    expect(problems(xyz('https://tile.openstreetmap.org/{z}/{x}/{y}.png'))).toEqual([]);
    expect(problems(xyz('https://tile.openstreetmap.org/tiles.png')).join('\n')).toMatch(/an address with \{z\}, \{x\} and \{y\}/);
  });

  it('needs the root language among the available ones', () => {
    const dir = broken('app.yaml', (s) => s.replace('root: pl', 'root: de'));
    expect(problems(dir).join(' ')).toMatch(/app\.yaml:\d+:\d+ locales\.root must be one of locales\.available/);
  });

  it('needs every text in the default language, and keeps paths inside the directory', () => {
    const missing = broken('app.yaml', (s) => s.replace('welcome: content/welcome', 'welcome: content/hello'));
    expect(problems(missing).join('\n')).toMatch(/content\.welcome: content\/hello\.en\.md not found/);
    const outside = broken('app.yaml', (s) => s.replace('welcome: content/welcome', 'welcome: ../secret'));
    expect(problems(outside).join('\n')).toMatch(/content\.welcome: a path inside the configuration directory/);
  });

  it('finds the skin in the configuration directory or among the built-in ones', () => {
    expect(loadConfig('config').skin).toContain('--accent: #466946');
    const own = broken('app.yaml', (s) => `${s}skin: moja\n`);
    expect(problems(own).join(' ')).toMatch(/skin: skins\/moja\/skin\.css not found/);
    mkdirSync(join(own, 'skins', 'moja'), { recursive: true });
    writeFileSync(join(own, 'skins', 'moja', 'skin.css'), ':root { --accent: #123456; }');
    expect(loadConfig(own).skin).toContain('#123456');
  });

  it('reads the brand images and gives them addresses that change with the file', () => {
    const config = loadConfig('config');
    expect(config.brand.logo).toMatchObject({ path: '/brand/logo.svg', type: 'image/svg+xml' });
    expect(config.brand.icon).toBeUndefined();
    expect(clientConfig(config, 'pl').app.author.logo).toBe(`/brand/logo.svg?v=${config.brand.logo?.version}`);
    const own = broken(
      'app.yaml',
      (s) => `${s}icon: brand/sign.png
`,
    );
    expect(problems(own).join(' ')).toMatch(/app\.yaml:\d+:\d+ icon: brand\/sign\.png not found/);
    writeFileSync(join(own, 'brand', 'sign.png'), 'one');
    const first = loadConfig(own).brand.icon;
    expect(first).toMatchObject({ path: '/brand/icon.png', type: 'image/png' });
    writeFileSync(join(own, 'brand', 'sign.png'), 'two');
    expect(loadConfig(own).brand.icon?.version).not.toBe(first?.version);
    expect(clientConfig(loadConfig(own), 'pl').app.icon).toMatch(/^\/brand\/icon\.png\?v=[0-9a-f]{12}$/);
    for (const path of ['../logo.svg', 'brand/../../logo.svg', '.hidden/logo.svg', 'brand/logo.gif']) {
      const outside = broken('app.yaml', (s) => s.replace('logo: brand/envirosolutions.svg', `logo: ${path}`));
      expect(problems(outside).join(' ')).toMatch(/author\.logo: a path of an \.svg, \.png, \.webp or \.jpg file/);
    }
  });

  it('needs https for every service the browser loads', () => {
    const dir = broken('layers.yaml', (s) => s.replace('url: https://integracja.gugik.gov.pl', 'url: http://integracja.gugik.gov.pl'));
    expect(problems(dir).join(' ')).toMatch(/layers\.yaml:\d+:\d+ layer "kieg" needs an https address/);
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

  it('names the fallback map as configured, else after its host', () => {
    const named = clientConfig(loadConfig('config'), 'pl');
    expect(named.links.fallbackMap).toEqual({ url: 'https://mapy.geoportal.gov.pl/imap/Imgp_2.html', name: 'geoportal.gov.pl' });
    const unnamed = broken('app.yaml', (s) =>
      s.replace(/^ {2}fallbackName: .*\n/m, '').replace('https://mapy.geoportal', 'https://www.geoportal'),
    );
    expect(clientConfig(loadConfig(unnamed), 'pl').links.fallbackMap?.name).toBe('geoportal.gov.pl');
    const none = broken('app.yaml', (s) => s.replace(/^links:\n[\s\S]*?\n\n/m, ''));
    expect(clientConfig(loadConfig(none), 'pl').links).toEqual({});
  });

  it('keeps the GUGiK texts in the deployment, not in the app', () => {
    const own = clientConfig(loadConfig('config'), 'pl').messages;
    expect(own['info.fields.opis_oznac']).toBe('Przeznaczenie');
    expect(own['print.note']).toContain('geoportal.gov.pl');
    const plain = clientConfig(loadConfig('examples/osm'), 'pl').messages;
    expect(plain['info.fields.opis_oznac']).toBeUndefined();
    expect(plain['print.note']).not.toMatch(/geoportal\.gov\.pl|GUGiK/);
  });
});
