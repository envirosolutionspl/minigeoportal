import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LineCounter, parseDocument, isMap, isSeq, type Document, type Node as YamlNode } from 'yaml';
import type { ZodType } from 'zod';
import { appSchema, layersSchema, mapSchema, type AppConfig } from './schema.ts';
import { loadMessages } from './messages.ts';
import * as modules from '../modules/index.ts';

/**
 * Reads and checks the configuration directory. Every problem is reported with its file, line and
 * column, so the person editing the YAML knows where to look; the server does not start with
 * a configuration that has any.
 */

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Configuration has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n${problems.map((p) => `  ${p}`).join('\n')}`);
    this.problems = problems;
  }
}

interface Parsed<T> {
  value?: T;
  doc?: Document;
  lines: LineCounter;
}

/** Keys that look like secrets: those belong in environment variables, never in config files. */
const SECRET = /pass|secret|token|api.?key|credential/i;

function locate(file: string, doc: Document | undefined, lines: LineCounter, path: (string | number)[]): string {
  let node = doc?.getIn(path, true) as YamlNode | undefined;
  // A missing key has no node: point at the closest parent that exists.
  for (let p = path.slice(0, -1); !node && p.length; p = p.slice(0, -1)) node = doc?.getIn(p, true) as YamlNode | undefined;
  const at = node?.range?.[0];
  if (at === undefined) return file;
  const { line, col } = lines.linePos(at);
  return `${file}:${line}:${col}`;
}

function secrets(node: unknown, path: (string | number)[], found: (string | number)[][]): void {
  if (isMap(node)) {
    for (const item of node.items) {
      const key = String((item.key as { value?: unknown })?.value ?? item.key);
      if (SECRET.test(key)) found.push([...path, key]);
      secrets(item.value, [...path, key], found);
    }
  } else if (isSeq(node)) {
    node.items.forEach((item, i) => secrets(item, [...path, i], found));
  }
}

function readFile<T>(dir: string, file: string, schema: ZodType<T>, problems: string[]): Parsed<T> {
  const lines = new LineCounter();
  let source: string;
  try {
    source = readFileSync(join(dir, file), 'utf8');
  } catch {
    problems.push(`${file}: file not found`);
    return { lines };
  }
  const doc = parseDocument(source, { lineCounter: lines, prettyErrors: true });
  for (const e of doc.errors) {
    const { line, col } = lines.linePos(e.pos[0]);
    problems.push(`${file}:${line}:${col} ${e.message.split('\n')[0]}`);
  }
  if (doc.errors.length) return { doc, lines };

  const found: (string | number)[][] = [];
  secrets(doc.contents, [], found);
  for (const path of found) {
    problems.push(
      `${locate(file, doc, lines, path)} ${path.join('.')}: secrets belong in environment variables, not in configuration files`,
    );
  }

  const result = schema.safeParse(doc.toJS());
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.filter((p): p is string | number => typeof p !== 'symbol');
      problems.push(`${locate(file, doc, lines, path)} ${path.join('.') || '(file)'}: ${issue.message}`);
    }
    return { doc, lines };
  }
  return { value: result.data, doc, lines };
}

/** Ids used in one place that must exist in another, and rules spanning several files. */
function crossCheck(
  app: Parsed<AppConfig['app']>,
  map: Parsed<AppConfig['map']>,
  layers: Parsed<AppConfig['layers']>,
  problems: string[],
): void {
  const at = (p: Parsed<unknown>, file: string, path: (string | number)[]) => locate(file, p.doc, p.lines, path);
  const unique = <T extends { id: string }>(list: T[], p: Parsed<unknown>, file: string, key: string) => {
    const seen = new Set<string>();
    list.forEach((item, i) => {
      if (seen.has(item.id)) problems.push(`${at(p, file, [key, i, 'id'])} ${key}.${i}.id: "${item.id}" is used twice`);
      seen.add(item.id);
    });
    return seen;
  };

  if (map.value) {
    const m = map.value;
    const services = unique(m.tileServices, map, 'map.yaml', 'tileServices');
    const bases = unique(m.baseMaps, map, 'map.yaml', 'baseMaps');
    m.baseMaps.forEach((b, i) =>
      b.sources.forEach((s, j) => {
        if (!services.has(s.service))
          problems.push(`${at(map, 'map.yaml', ['baseMaps', i, 'sources', j, 'service'])} unknown tile service "${s.service}"`);
      }),
    );
    for (const key of ['base', 'baseMobile', 'toggleBase'] as const) {
      const value = m.view[key];
      if (value && !bases.has(value)) problems.push(`${at(map, 'map.yaml', ['view', key])} view.${key}: unknown base map "${value}"`);
    }
    if (m.timeTravel?.base && !bases.has(m.timeTravel.base))
      problems.push(`${at(map, 'map.yaml', ['timeTravel', 'base'])} timeTravel.base: unknown base map "${m.timeTravel.base}"`);
    m.timeTravel?.layers.forEach((l, i) => {
      if (l.base && !bases.has(l.base))
        problems.push(
          `${at(map, 'map.yaml', ['timeTravel', 'layers', i, 'base'])} timeTravel.layers.${i}.base: unknown base map "${l.base}"`,
        );
    });
    if (m.view.zoom > m.zoom.scales.length - 1)
      problems.push(`${at(map, 'map.yaml', ['view', 'zoom'])} view.zoom: there are only ${m.zoom.scales.length} zoom levels`);
    // The browser loads tiles and map images itself: the page's CSP and HTTPS allow only https.
    m.tileServices.forEach((s, i) => {
      if (!s.url.startsWith('https:'))
        problems.push(`${at(map, 'map.yaml', ['tileServices', i, 'url'])} tile service "${s.id}" needs an https address`);
      if (s.kind !== 'wmts') return;
      if (s.firstLevel + s.levels > m.zoom.scales.length)
        problems.push(`${at(map, 'map.yaml', ['tileServices', i])} tile service "${s.id}" goes past the last zoom level`);
      if (!m.tileGrid) problems.push(`${at(map, 'map.yaml', ['tileServices', i])} WMTS service "${s.id}" needs map.yaml tileGrid`);
    });
  }

  if (layers.value) {
    const l = layers.value;
    const topics = unique(l.topics, layers, 'layers.yaml', 'topics');
    const overlays = unique(l.overlays, layers, 'layers.yaml', 'overlays');
    l.overlays.forEach((o, i) => {
      if (!topics.has(o.topic)) problems.push(`${at(layers, 'layers.yaml', ['overlays', i, 'topic'])} unknown topic "${o.topic}"`);
      if (!o.url.startsWith('https:'))
        problems.push(`${at(layers, 'layers.yaml', ['overlays', i, 'url'])} layer "${o.id}" needs an https address`);
    });
    (l.drawOrder ?? []).forEach((idInOrder, i) => {
      if (!overlays.has(idInOrder)) problems.push(`${at(layers, 'layers.yaml', ['drawOrder', i])} unknown overlay "${idInOrder}"`);
    });
    if (map.value) {
      map.value.view.overlays.forEach((o, i) => {
        if (!overlays.has(o)) problems.push(`${at(map, 'map.yaml', ['view', 'overlays', i])} unknown overlay "${o}"`);
      });
      map.value.timeTravel?.layers.forEach((entry, i) => {
        if (!l.overlays.some((o) => o.id === entry.id && o.time))
          problems.push(
            `${at(map, 'map.yaml', ['timeTravel', 'layers', i, 'id'])} timeTravel.layers.${i}.id: "${entry.id}" is not an overlay with a time block`,
          );
      });
    }
  }

  if (app.value) {
    const a = app.value;
    if (!a.locales.available.includes(a.locales.default)) {
      problems.push(`${at(app, 'app.yaml', ['locales', 'default'])} locales.default must be one of locales.available`);
    }
    if (a.locales.root && !a.locales.available.includes(a.locales.root)) {
      problems.push(`${at(app, 'app.yaml', ['locales', 'root'])} locales.root must be one of locales.available`);
    }
    if (a.report.locale && !a.locales.available.includes(a.report.locale)) {
      problems.push(`${at(app, 'app.yaml', ['report', 'locale'])} report.locale must be one of locales.available`);
    }
    const parsed = { 'app.yaml': app, 'map.yaml': map, 'layers.yaml': layers };
    for (const p of modules.validate(a, map.value, layers.value)) problems.push(`${at(parsed[p.file], p.file, p.path)} ${p.message}`);
  }
}

/** The Markdown texts in every language that has them; the default language must. */
function readContent(root: string, app: Parsed<AppConfig['app']>, problems: string[]): AppConfig['content'] {
  const content: AppConfig['content'] = {};
  if (!app.value) return content;
  const { locales } = app.value;
  for (const [name, path] of Object.entries(app.value.content) as [keyof AppConfig['content'], string | undefined][]) {
    if (!path) continue;
    const texts: Record<string, string> = {};
    for (const locale of locales.available) {
      try {
        texts[locale] = readFileSync(join(root, `${path}.${locale}.md`), 'utf8');
      } catch {
        if (locale === locales.default) {
          problems.push(`${locate('app.yaml', app.doc, app.lines, ['content', name])} content.${name}: ${path}.${locale}.md not found`);
        }
      }
    }
    content[name] = texts;
  }
  return content;
}

/** Skins that come with the app; a deployment's own go to skins/ in its configuration directory. */
const BUILT_IN_SKINS = resolve(dirname(fileURLToPath(import.meta.url)), '../../skins');

function readSkin(root: string, app: Parsed<AppConfig['app']>, problems: string[]): string {
  const name = app.value?.skin;
  if (!name) return '';
  for (const dir of [join(root, 'skins'), BUILT_IN_SKINS]) {
    try {
      return readFileSync(join(dir, name, 'skin.css'), 'utf8');
    } catch {
      // Not there: the next place.
    }
  }
  problems.push(`${locate('app.yaml', app.doc, app.lines, ['skin'])} skin: skins/${name}/skin.css not found`);
  return '';
}

const IMAGE_TYPES: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/** The author's logo and the app's icon, when app.yaml names them. */
function readBrand(root: string, app: Parsed<AppConfig['app']>, problems: string[]): AppConfig['brand'] {
  const brand: AppConfig['brand'] = {};
  const wanted = [
    ['logo', app.value?.author.logo, ['author', 'logo']],
    ['icon', app.value?.icon, ['icon']],
  ] as const;
  for (const [name, file, at] of wanted) {
    if (!file) continue;
    try {
      const body = readFileSync(join(root, file));
      const ext = extname(file).toLowerCase();
      const version = createHash('sha256').update(body).digest('hex').slice(0, 12);
      brand[name] = { path: `/brand/${name}${ext}`, version, type: IMAGE_TYPES[ext], body };
    } catch {
      problems.push(`${locate('app.yaml', app.doc, app.lines, [...at])} ${at.join('.')}: ${file} not found`);
    }
  }
  return brand;
}

/** The configuration in `dir`, checked; throws ConfigError listing every problem. */
export function loadConfig(dir: string): AppConfig {
  const root = resolve(dir);
  const problems: string[] = [];
  const app = readFile(root, 'app.yaml', appSchema, problems);
  const map = readFile(root, 'map.yaml', mapSchema, problems);
  const layers = readFile(root, 'layers.yaml', layersSchema, problems);
  crossCheck(app, map, layers, problems);
  const content = readContent(root, app, problems);
  const skin = readSkin(root, app, problems);
  const brand = readBrand(root, app, problems);
  const messages = app.value ? loadMessages(root, app.value.locales, problems, modules.enabled(app.value)) : {};
  if (problems.length || !app.value || !map.value || !layers.value) throw new ConfigError(problems);
  return { dir: root, app: app.value, map: map.value, layers: layers.value, content, skin, brand, messages };
}
