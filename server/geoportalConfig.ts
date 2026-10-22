import { readLimited } from './http.ts';

/**
 * The layer list of geoportal.gov.pl, read from the configuration of its map application.
 * The configuration is JavaScript source (object literals with comments), so it is never
 * executed: comments are removed, the `services` array is split into its top-level objects with
 * a bracket matcher that respects strings, and fields are read with patterns. Each module (a
 * thematic map such as "Geoportal Krajowy") lists its layers as ids, with groups nested.
 */

export const CONFIG_BASE = 'https://mapy.geoportal.gov.pl/imapnext/imap/config/';
const TIMEOUT_MS = 30000;
const MAX_BYTES = 2_000_000;

export interface ConfigService {
  id: string;
  label: string;
  /** wms, wmts, tiled, dynamic (ArcGIS REST), basemap or group. */
  type: string;
  url?: string;
  /** Sublayers named in the configuration, in its order. */
  sublayers?: { name: string; title: string }[];
  /** Ids of members, for groups. */
  children?: string[];
  featureInfoFormat?: string;
  /** Layer of a WMTS, when the configuration names it. */
  layer?: string;
}

export interface ConfigModule {
  id: string;
  label: string;
  /** Top-level entries of the module's layer list (groups or layers), bottom to top. */
  layers: string[];
}

export interface GeoportalConfig {
  services: Map<string, ConfigService>;
  modules: ConfigModule[];
}

export const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Top-level `{...}` items of the array whose `[` is at `start`. */
export function arrayItems(code: string, start: number): string[] {
  const items: string[] = [];
  let depth = 0;
  let itemStart = -1;
  let quote: string | null = null;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '[' || ch === '{') {
      if (depth === 1 && ch === '{') itemStart = i;
      depth++;
    } else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 1 && ch === '}' && itemStart >= 0) {
        items.push(code.slice(itemStart, i + 1));
        itemStart = -1;
      }
      if (depth === 0) break;
    }
  }
  return items;
}

const field = (src: string, key: string) => src.match(new RegExp(`(?:^|[\\s{,])${key}:\\s*'([^']*)'`))?.[1];
/**
 * The object with nested arrays and objects emptied, so only fields of the object itself are
 * found. Brackets inside strings (such as `${prefix}` in addresses) are text, not structure.
 */
const ownFields = (obj: string) => {
  let out = '';
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < obj.length; i++) {
    const ch = obj[i];
    if (quote) {
      if (depth === 1) out += ch;
      if (ch === '\\') {
        if (depth === 1) out += obj[i + 1] ?? '';
        i++;
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      if (depth === 1) out += ch;
    } else if (ch === '[' || ch === '{') {
      depth++;
      if (depth === 1) out += ch;
      else if (depth === 2) out += ch === '[' ? '[]' : '{}';
    } else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) out += ch;
    } else if (depth === 1) out += ch;
  }
  return out;
};

/** Services and groups defined in one configuration file. */
export function parseServices(source: string, prefixes: Record<string, string> = {}): ConfigService[] {
  const code = stripComments(source);
  const m = code.match(/\bservices:\s*\[/);
  if (!m || m.index === undefined) return [];
  return arrayItems(code, m.index + m[0].length - 1).flatMap((obj) => {
    const own = ownFields(obj);
    const id = field(own, 'id');
    if (!id) return [];
    const url = field(own, 'url')?.replace(/\$\{(\w+)\}/g, (all, key: string) => prefixes[key] ?? all);
    const sublayers = obj.match(/sublayers:\s*\[([\s\S]*?)\]\s*,?\s*(?:\w+:|\})/)?.[1];
    // Some entries name their layers in a plain list instead: visibleLayers: ['Raster_10_1965'].
    const visible = obj.match(/visibleLayers:\s*\[([^\]]*)\]/)?.[1];
    const subs = sublayers
      ? [...sublayers.matchAll(/name:\s*'([^']+)'[^}]*?title:\s*'([^']*)'/g)].map(([, name, title]) => ({ name, title }))
      : [...(visible ?? '').matchAll(/'([^']+)'/g)].map(([, name]) => ({ name, title: name }));
    const children = [...obj.matchAll(/layerId:\s*'([^']+)'/g)].map((x) => x[1]);
    const type = field(own, 'type') ?? (children.length ? 'group' : '');
    return [
      {
        id,
        label: field(own, 'label') ?? '',
        type,
        ...(url && /^https:\/\//.test(url) ? { url } : {}),
        ...(subs.length ? { sublayers: subs } : {}),
        ...(type === 'group' && children.length ? { children } : {}),
        ...(field(obj, 'featureInfoFormat') ? { featureInfoFormat: field(obj, 'featureInfoFormat') } : {}),
        ...(field(obj, 'identifier') ? { layer: field(obj, 'identifier') } : {}),
      },
    ];
  });
}

/** The module (thematic map) defined in a configuration part, if any. */
export function parseModule(source: string): ConfigModule | undefined {
  const code = stripComments(source);
  const m = code.match(/gpmaps:\s*\[\s*\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)'/);
  if (!m || m.index === undefined) return undefined;
  const rest = code.slice(m.index);
  const layers = rest.match(/\n\s*layers:\s*\[/);
  if (!layers || layers.index === undefined) return undefined;
  const list = arrayItems(rest, layers.index + layers[0].length - 1)
    .map((item) => field(item, 'layerId'))
    .filter((x): x is string => Boolean(x));
  return { id: m[1], label: m[2], layers: list };
}

/** Parts named in init.js, e.g. config_parts/part_GeoportalKrajowy.js. */
export const partNames = (initJs: string) => [...new Set(initJs.match(/config_parts\/part_[A-Za-z0-9_]+\.js/g) ?? [])];

/** Values like msPodkl in prefixes.js, used as ${msPodkl} in service URLs. */
export const parsePrefixes = (source: string) =>
  Object.fromEntries([...stripComments(source).matchAll(/(\w+):\s*'(https:\/\/[^']+)'/g)].map(([, k, v]) => [k, v]));

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url.slice(CONFIG_BASE.length)}: HTTP ${res.status}`);
  return new TextDecoder().decode(await readLimited(res, MAX_BYTES));
}

/** Downloads and parses the whole configuration: main file, prefixes and every module part. */
export async function fetchGeoportalConfig(): Promise<GeoportalConfig> {
  const [main, init, prefixesJs] = await Promise.all([
    fetchText(`${CONFIG_BASE}application.properties.js`),
    fetchText(`${CONFIG_BASE}init.js`),
    fetchText(`${CONFIG_BASE}prefixes.js`).catch(() => ''),
  ]);
  const prefixes = parsePrefixes(prefixesJs);
  const parts = await Promise.all(partNames(init).map((p) => fetchText(`${CONFIG_BASE}${p}`)));
  const services = new Map<string, ConfigService>();
  // Parts may redefine a service; the main file is read last so it wins, as in the application.
  for (const src of [...parts, main]) for (const s of parseServices(src, prefixes)) services.set(s.id, s);
  const modules = parts.map(parseModule).filter((m): m is ConfigModule => Boolean(m));
  if (services.size < 50 || modules.length === 0) throw new Error(`Unexpected configuration: ${services.size} services, ${modules.length} modules`);
  return { services, modules };
}
