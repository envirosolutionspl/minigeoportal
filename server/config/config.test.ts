import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './load.ts';
import { clientConfig, creditHtml, textIn } from './client.ts';

/** The default configuration, read once: most tests only look at it. */
const DEFAULT = loadConfig('config');

// One copy of the default configuration serves every test: the files a test writes are put back after it.
let copy: string;
const touched = new Set<string>();
beforeAll(() => {
  copy = mkdtempSync(join(tmpdir(), 'config-'));
  cpSync('config', copy, { recursive: true });
});
afterAll(() => rmSync(copy, { recursive: true, force: true }));

/** Puts back the original of each file written: the file itself, or nothing where the original has none. */
function restore(): void {
  for (const file of touched) {
    const parts = file.split('/');
    const added = parts.findIndex((_, i) => !existsSync(join('config', ...parts.slice(0, i + 1))));
    if (added < 0) copyFileSync(join('config', file), join(copy, file));
    else rmSync(join(copy, ...parts.slice(0, added + 1)), { recursive: true, force: true });
  }
  touched.clear();
}
afterEach(restore);

/** Writes a file of the copy (a path with slashes), to be put back after the test. */
function put(file: string, text: string): string {
  touched.add(file);
  mkdirSync(dirname(join(copy, file)), { recursive: true });
  writeFileSync(join(copy, file), text);
  return copy;
}

/** The default configuration with one file edited; what the test edited before is put back first. */
function broken(file: string, edit: (source: string) => string): string {
  restore();
  return put(file, edit(readFileSync(join('config', file), 'utf8')));
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
  const config = clientConfig(DEFAULT, 'pl');

  it('stays what the app was built with (any change shows up here)', () => {
    // Texts of the interface have their own tests (i18n.test.ts), the Markdown ones markdown.test.ts
    // and WelcomeDialog.test.tsx. Of the layers, one in full shows how layers.yaml reaches the app.
    const { messages: _, content, layers, ...rest } = config;
    expect({
      ...rest,
      // The logo's address carries the file's hash: a new logo is not a change of the configuration.
      app: { ...rest.app, author: { ...rest.app.author, logo: rest.app.author.logo?.replace(/\?v=\w+$/, '?v=HASH') } },
      content: Object.keys(content),
      layers: { ...layers, overlays: layers.overlays.map((o) => o.id) },
      overlay: layers.overlays.find((o) => o.id === 'kiut'),
    }).toMatchSnapshot();
  });

  it('keeps the first view, the search and the modules', () => {
    expect(config.app).toMatchObject({ name: 'MiniGeoportal', storagePrefix: 'minigeoportal.' });
    expect(config.map.attribution).toBe(
      'Dane: <a href="https://www.geoportal.gov.pl" target="_blank" rel="noopener">GUGiK, geoportal.gov.pl</a>',
    );
    expect(config.layers.drawOrder).toEqual([
      'mapy-dawne',
      'orto-archiwalna',
      'suikzp',
      'kimpzp',
      'pog',
      'kibdot',
      'kiut',
      'kieg',
      'rcn',
      'kina',
      'prg',
    ]);
    expect(config.map.view).toMatchObject({ center: [500000, 465000], zoom: 3, base: 'mapa', baseMobile: 'prosta', overlays: ['kieg'] });
    expect(config.map.view.home).toEqual([170000, 130000, 870000, 800000]);
    expect(config.search).toEqual({ provider: 'gugik', parcel: true });
    expect(config.modules.gugik).toEqual({
      catalog: true,
      drawOrder: true,
      ortho: { service: 'orto', history: 'orto-archiwalna' },
      topo: { history: 'mapy-dawne' },
      parcelReport: true,
      elevation: true,
    });
  });
});

describe('default configuration in English', () => {
  const en = clientConfig(DEFAULT, 'en');

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

  it('finds the photos of the gugik module among the tile services, or leaves them out', () => {
    const unknown = broken('app.yaml', (s) => s.replace('ortho: { service: orto,', 'ortho: { service: zdjecia,'));
    expect(problems(unknown).join('\n')).toMatch(/app\.yaml:\d+:\d+ modules\.gugik\.ortho\.service: unknown tile service "zdjecia"/);
    const noTime = broken('app.yaml', (s) => s.replace('history: orto-archiwalna }', 'history: kieg }'));
    expect(problems(noTime).join('\n')).toMatch(/modules\.gugik\.ortho\.history: "kieg" is not an overlay with a time block/);
    const off = broken('app.yaml', (s) => s.replace(/ortho: \{ service: orto, history: orto-archiwalna \}/, 'ortho: false'));
    expect(clientConfig(loadConfig(off), 'pl').modules.gugik?.ortho).toBe(false);
  });

  it('needs the time view to name a layer with a time block and a base map that exists', () => {
    const dir = broken('map.yaml', (s) =>
      s
        .replace(
          '    - { id: mapy-dawne, label: { pl: Mapy dawne, en: Old maps }, base: mapa }',
          '    - { id: kieg, label: Kieg, base: mapka }',
        )
        .replace('  base: orto\n  layers:', '  base: zdjecia\n  layers:'),
    );
    expect(problems(dir).join('\n')).toMatch(/map\.yaml:\d+:\d+ timeTravel\.layers\.1\.id: "kieg" is not an overlay with a time block/);
    expect(problems(dir).join('\n')).toMatch(/map\.yaml:\d+:\d+ timeTravel\.base: unknown base map "zdjecia"/);
    expect(problems(dir).join('\n')).toMatch(/map\.yaml:\d+:\d+ timeTravel\.layers\.1\.base: unknown base map "mapka"/);
    const config = clientConfig(DEFAULT, 'pl');
    expect(config.map.timeTravel).toEqual({
      layers: [
        { id: 'orto-archiwalna', label: 'Zdjęcia' },
        { id: 'mapy-dawne', label: 'Mapy dawne', base: 'mapa' },
      ],
      base: 'orto',
    });
    expect(clientConfig(DEFAULT, 'en').map.timeTravel?.layers[1].label).toBe('Old maps');
    const oldMaps = config.layers.overlays.find((o) => o.id === 'mapy-dawne')!;
    expect(oldMaps.time).toMatchObject({ type: 'series' });
    expect((oldMaps.time as { editions: unknown[] }).editions).toHaveLength(3);
    expect((oldMaps.time as { editions: unknown[] }).editions[0]).toEqual({
      value: '1942',
      layer: 'Raster_50_1942,Raster_10_1942',
      label: 'Mapy w układzie 1942',
    });
    expect(config.layers.overlays.find((o) => o.id === 'orto-archiwalna')).toMatchObject({ format: 'image/jpeg', time: { param: 'TIME' } });
  });

  it('needs the topics of the geoportal catalog in layers.yaml while the catalog is on', () => {
    const noTopic = (s: string) => s.replace(/ {2}- id: zabytki\n.*\n/, '').replace(/topic: zabytki/g, 'topic: inne');
    expect(problems(broken('layers.yaml', noTopic)).join('\n')).toMatch(
      /layers\.yaml:\d+:\d+ topics: the geoportal catalog needs the topics zabytki/,
    );
    const dir = broken('layers.yaml', noTopic);
    put('app.yaml', readFileSync(join(dir, 'app.yaml'), 'utf8').replace('    catalog: true', '    catalog: false'));
    expect(problems(dir)).toEqual([]);
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
    expect(DEFAULT.skin).toContain('--accent: #466946');
    const own = broken('app.yaml', (s) => `${s}skin: moja\n`);
    expect(problems(own).join(' ')).toMatch(/skin: skins\/moja\/skin\.css not found/);
    put('skins/moja/skin.css', ':root { --accent: #123456; }');
    expect(loadConfig(own).skin).toContain('#123456');
  });

  it('reads the brand images and gives them addresses that change with the file', () => {
    expect(DEFAULT.brand.logo).toMatchObject({ path: '/brand/logo.svg', type: 'image/svg+xml' });
    expect(DEFAULT.brand.icon).toBeUndefined();
    expect(clientConfig(DEFAULT, 'pl').app.author.logo).toBe(`/brand/logo.svg?v=${DEFAULT.brand.logo?.version}`);
    const own = broken('app.yaml', (s) => `${s}icon: brand/sign.png\n`);
    expect(problems(own).join(' ')).toMatch(/app\.yaml:\d+:\d+ icon: brand\/sign\.png not found/);
    put('brand/sign.png', 'one');
    const first = loadConfig(own).brand.icon;
    expect(first).toMatchObject({ path: '/brand/icon.png', type: 'image/png' });
    put('brand/sign.png', 'two');
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

  it('needs https for every image the browser loads: legends, editions of a series, thumbnails', () => {
    const legend = broken('layers.yaml', (s) =>
      s.replace('      - name: uzytki\n', '      - name: uzytki\n        legend: http://a.example/legend.png\n'),
    );
    expect(problems(legend).join('\n')).toMatch(/layers\.yaml:\d+:\d+ overlays\.0\.sublayers\.0\.legend: an https address/);
    const edition = broken('layers.yaml', (s) => s.replace(/( {8}- value: '?1942'?)\n/, '$1\n          url: http://a.example/wms\n'));
    expect(problems(edition).join('\n')).toMatch(/layers\.yaml:\d+:\d+ overlays\.\d+\.time\.editions\.0\.url: an https address/);
    const thumb = broken('map.yaml', (s) => s.replace('thumb: /thumbs/orto.jpg', 'thumb: http://a.example/orto.jpg'));
    expect(problems(thumb).join('\n')).toMatch(/map\.yaml:\d+:\d+ baseMaps\.0\.thumb: a path such as/);
    expect(problems(broken('map.yaml', (s) => s.replace('thumb: /thumbs/orto.jpg', 'thumb: https://a.example/orto.jpg')))).toEqual([]);
  });

  it('refuses a service address the server would never ask: an odd port or a private address', () => {
    const port = broken('layers.yaml', (s) => s.replace('url: https://integracja.gugik.gov.pl', 'url: https://wms.intranet:8181'));
    expect(problems(port).join('\n')).toMatch(/layers\.yaml:\d+:\d+ layer "kieg": port 8181 is not a web port \(80, 443, 8080, 8443\)/);
    const inside = broken('map.yaml', (s) =>
      s.replace(/url: https:\/\/mapy\.geoportal\.gov\.pl\/wss\/service\/PZGIK\/ORTO\/WMTS/, 'url: https://10.0.0.5/wmts'),
    );
    expect(problems(inside).join('\n')).toMatch(/map\.yaml:\d+:\d+ tile service "orto": a private address/);
  });

  it('needs every text given per language in the default language', () => {
    const dir = broken('app.yaml', (s) => s.replace('  en: MiniGeoportal – a faster parcel map from the Polish Geoportal\n', ''));
    expect(problems(dir).join('\n')).toMatch(/app\.yaml:\d+:\d+ title: no text in the default language \(en\)/);
    const deep = broken('layers.yaml', (s) =>
      s.replace("title: { pl: 'Użytki gruntowe', en: 'Land use' }", "title: { pl: 'Użytki gruntowe' }"),
    );
    expect(problems(deep).join('\n')).toMatch(
      /layers\.yaml:\d+:\d+ overlays\.0\.sublayers\.0\.title: no text in the default language \(en\)/,
    );
  });

  it('says which file is missing', () => {
    const empty = mkdtempSync(join(tmpdir(), 'config-'));
    try {
      expect(problems(empty)).toContain('app.yaml: file not found');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
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
    const named = clientConfig(DEFAULT, 'pl');
    expect(named.links.fallbackMap).toEqual({ url: 'https://mapy.geoportal.gov.pl/imap/Imgp_2.html', name: 'geoportal.gov.pl' });
    const unnamed = broken('app.yaml', (s) =>
      s.replace(/^ {2}fallbackName: .*\n/m, '').replace('https://mapy.geoportal', 'https://www.geoportal'),
    );
    expect(clientConfig(loadConfig(unnamed), 'pl').links.fallbackMap?.name).toBe('geoportal.gov.pl');
    const none = broken('app.yaml', (s) => s.replace(/^links:\n[\s\S]*?\n\n/m, ''));
    expect(clientConfig(loadConfig(none), 'pl').links).toEqual({});
  });

  it('keeps the GUGiK texts in the deployment, not in the app', () => {
    const own = clientConfig(DEFAULT, 'pl').messages;
    expect(own['info.fields.opis_oznac']).toBe('Przeznaczenie');
    expect(own['print.note']).toContain('geoportal.gov.pl');
    const plain = clientConfig(loadConfig('examples/osm'), 'pl').messages;
    expect(plain['info.fields.opis_oznac']).toBeUndefined();
    expect(plain['print.note']).not.toMatch(/geoportal\.gov\.pl|GUGiK/);
  });

  it('reports a changed text the app does not have, but lets a deployment name attributes freely', () => {
    const typo = broken('i18n/pl.yaml', (s) => s.replace('searchPlaceholder:', 'searchPlacehodler:'));
    expect(problems(typo).join('\n')).toMatch(/i18n[\\/]pl\.yaml layers\.searchPlacehodler: not a text of the app/);
    const named = broken('i18n/pl.yaml', (s) => s.replace('  fields:\n', '  fields:\n    nowy_atrybut: Nowy atrybut\n'));
    expect(problems(named)).toEqual([]);
    // Texts of a module are the app's only with the module on.
    const off = broken('app.yaml', (s) =>
      s
        .replace('    enabled: true', '    enabled: false')
        .replace('provider: gugik', 'provider: none')
        .replace('parcel: true', 'parcel: false'),
    );
    put('i18n/pl.yaml', 'parcel:\n  title: Działka\n');
    expect(problems(off).join('\n')).toMatch(/i18n[\\/]pl\.yaml parcel\.title: not a text of the app/);
  });

  it('adds the texts of the gugik module only when the module is on', () => {
    expect(clientConfig(DEFAULT, 'en').messages['parcel.title']).toBe('Find a parcel');
    const plain = clientConfig(loadConfig('examples/osm'), 'pl').messages;
    expect(
      Object.keys(plain).filter((k) => /^(parcel|search\.gugik|search\.parcel)|^layers\.catalog|^info\.(parcelReport|photo)/.test(k)),
    ).toEqual([]);
    expect(Object.values(plain).filter((m) => typeof m === 'string' && /GUGiK|geoportal|działk/i.test(m))).toEqual([]);
  });
});
