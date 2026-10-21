import type ImageWMS from 'ol/source/ImageWMS';
import type { Overlay } from './registry';
import { infoFormat, layerMeta } from './meta';

/**
 * GetFeatureInfo through the backend proxy, and a parser that turns the many response
 * formats of GUGiK and local servers (HTML tables, HTML lists, Intergraph XML, MapServer
 * XML, GML) into plain label/value pairs. Upstream markup is never inserted into the page.
 */

export interface InfoField {
  label: string;
  value: string;
  href?: string;
}

export interface InfoRecord {
  title?: string;
  fields: InfoField[];
}

/** Technical attributes that mean nothing to a non-specialist. */
const HIDDEN = /^(id|fid|gid|objectid|shape|shape_length|shape_area|gdb_id|id_pg|geom|the_geom|geometry|kod qr|bbox)$/i;
const SERVICE_ERROR = /ServiceException/;
/** Local servers answer this way when they do not publish the layer: no data here, not a failure. */
const NOT_PUBLISHED = /LayerNotDefined|Invalid layer|layer might be disabled/i;

/** Queryable selected sublayers visible at the current scale; only those are sent. */
export function queryLayers(def: Overlay, selected: string[], scale: number): string[] {
  return selected.filter((name) => {
    const m = layerMeta(def.id, name);
    if (!m) return true;
    return m.queryable && scale >= (m.minScale ?? 0) && scale <= (m.maxScale ?? Infinity);
  });
}

export async function fetchFeatureInfo(
  def: Overlay,
  source: ImageWMS,
  coordinate: number[],
  resolution: number,
  layers: string[],
  signal: AbortSignal,
): Promise<InfoRecord[]> {
  const url = source.getFeatureInfoUrl(coordinate, resolution, 'EPSG:2180', {
    // Non-queryable layers in LAYERS make some servers reject the whole request.
    LAYERS: layers.join(','),
    QUERY_LAYERS: layers.join(','),
    INFO_FORMAT: infoFormat(def.id),
    FEATURE_COUNT: 10,
  });
  if (!url) return [];
  const res = await fetch(`/api/featureinfo/${def.id}?${new URL(url).searchParams.toString()}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  return parseFeatureInfo(body, res.headers.get('X-Upstream-Content-Type') ?? '');
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Parses markup and drops what carries no text for a reader. */
function parseHtmlFragment(markup: string): Document {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  doc.querySelectorAll('script, style').forEach((n) => n.remove());
  return doc;
}

/** Readable names for technical attribute names seen in GUGiK and local services. */
const LABELS: Record<string, string> = {
  opis_oznac: 'Przeznaczenie',
  'opis oznac': 'Przeznaczenie',
  'Rodzaj oznaczenia': 'Symbol przeznaczenia',
  'Data DUWM': 'Data publikacji w dzienniku urzędowym',
  'Data zasilenia': 'Data aktualizacji w GUGiK',
  WWW: 'Strona uchwały',
};

/** A value may itself be markup (Intergraph wraps links and QR codes in CDATA). */
function field(label: string, raw: string): InfoField | null {
  label = clean(label);
  if (!label || HIDDEN.test(label)) return null;
  label = LABELS[label] ?? label;
  if (/<[a-z]/i.test(raw)) {
    const doc = parseHtmlFragment(raw);
    const link = doc.querySelector('a[href]');
    const text = clean(doc.body.textContent);
    if (link && /^https?:/i.test(link.getAttribute('href') ?? '')) {
      return { label, value: text || 'Otwórz', href: link.getAttribute('href')! };
    }
    return text ? { label, value: text } : null;
  }
  const value = clean(raw);
  if (!value) return null;
  return /^https?:\/\/\S+$/i.test(value) ? { label, value, href: value } : { label, value };
}

/** ArcGIS titles look like "FeatureInfoCollection - layer name: 'Przeznaczenia MPZP'". */
function cleanTitle(title: string | undefined): string | undefined {
  const t = clean(title)
    .replace(/^FeatureInfoCollection\s*-\s*layer name:\s*/i, '')
    .replace(/^['"]|['"]$/g, '');
  return t || undefined;
}

function push(records: InfoRecord[], title: string | undefined, fields: (InfoField | null)[]) {
  const kept = fields.filter((f): f is InfoField => f !== null);
  if (kept.length > 0) records.push({ title: cleanTitle(title), fields: kept });
}

/** Nearest heading before an element, used as the record title. */
function headingBefore(el: Element): string | undefined {
  for (let n: Element | null = el.previousElementSibling; n; n = n.previousElementSibling) {
    if (/^H[1-6]$/.test(n.tagName)) return n.textContent ?? undefined;
  }
  return undefined;
}

function parseHtml(doc: Document): InfoRecord[] {
  const records: InfoRecord[] = [];
  for (const table of doc.querySelectorAll('table')) {
    const rows = [...table.querySelectorAll('tr')];
    const header = rows[0] ? [...rows[0].querySelectorAll('th')] : [];
    const title = headingBefore(table);
    if (header.length > 1 && rows.length > 1) {
      // Column table: one record per data row.
      for (const row of rows.slice(1)) {
        const cells = [...row.querySelectorAll('td')];
        push(records, title, cells.map((td, i) => field(header[i]?.textContent ?? '', td.innerHTML)));
      }
    } else {
      // Key/value table: two cells per row.
      push(
        records,
        title,
        rows.map((row) => {
          const cells = [...row.querySelectorAll('th, td')];
          return cells.length >= 2 ? field(cells[0].textContent ?? '', cells[1].innerHTML) : null;
        }),
      );
    }
  }
  return records;
}

function parseXml(doc: Document): InfoRecord[] {
  const records: InfoRecord[] = [];
  // Intergraph GeoMedia (KIEG, KIUT): <Layer Name><Attribute Name>value</Attribute></Layer>
  const attrLayers = [...doc.getElementsByTagName('Layer')].filter((l) => l.getElementsByTagName('Attribute').length);
  if (attrLayers.length > 0) {
    for (const layer of attrLayers) {
      const attrs = [...layer.getElementsByTagName('Attribute')];
      push(records, undefined, attrs.map((a) => field(a.getAttribute('Name') ?? '', a.textContent ?? '')));
    }
    return records;
  }
  // Generic XML / GML: every element whose children are only text is a field, grouped by its parent.
  const groups = new Map<Element, InfoField[]>();
  for (const el of doc.getElementsByTagName('*')) {
    if (el.children.length > 0 || el.namespaceURI === 'http://www.opengis.net/gml') continue;
    const f = field(el.localName.replace(/_/g, ' '), el.textContent ?? '');
    const parent = el.parentElement;
    if (!f || !parent) continue;
    groups.set(parent, [...(groups.get(parent) ?? []), f]);
  }
  for (const [parent, fields] of groups) {
    push(records, parent.getAttribute('name') ?? parent.localName.replace(/_feature$|_layer$/i, ''), fields);
  }
  return records;
}

/** The same feature often comes back from several scale variants of one layer. */
function unique(records: InfoRecord[]): InfoRecord[] {
  const seen = new Set<string>();
  return records.filter((r) => {
    const key = JSON.stringify(r.fields);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseFeatureInfo(body: string, contentType: string): InfoRecord[] {
  return unique(parseAny(body, contentType));
}

function parseAny(body: string, contentType: string): InfoRecord[] {
  if (!body.trim() || NOT_PUBLISHED.test(body)) return [];
  if (SERVICE_ERROR.test(body)) throw new Error('Serwer odrzucił zapytanie');
  const xml = /xml|gml/i.test(contentType) || body.trimStart().startsWith('<?xml');
  if (xml) {
    const doc = new DOMParser().parseFromString(body, 'application/xml');
    if (!doc.querySelector('parsererror')) return parseXml(doc);
  }
  // HTML without tables is a server's own page (help text, empty templates), not feature data.
  return parseHtml(parseHtmlFragment(body));
}
