import ImageWMS from 'ol/source/ImageWMS';
import WMTS from 'ol/source/WMTS';
import type WMTSTileGrid from 'ol/tilegrid/WMTS';
import type { Overlay } from '@/config/runtime';
import { infoFormat, layerMeta, restMeta, wmtsMeta } from './meta';
import { PROJECTION } from '@/map/projection';
import { t } from '@/i18n';
import type { OverlayLayer } from './layers';

/**
 * Point queries through the backend proxy (WMS and WMTS GetFeatureInfo, ArcGIS identify), and
 * a parser that turns the many response formats of GUGiK and local servers (HTML tables, lists
 * and bold labels, Intergraph XML, MapServer XML, GML, ArcGIS JSON) into plain label/value pairs. Upstream
 * markup is never inserted into the page.
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
const HIDDEN = /^(id|fid|gid|objectid|esri_oid|sys_id|shape([._].*)?|gdb_id|id_pg|geom|geometria|the_geom|geometry|raster|kod qr|bbox)$/i;
/**
 * Fields of an ArcGIS mosaic of scanned sheets (topographic maps, aerial photos): pixel sizes,
 * centres and who edited the record. The sheet name, series and date stay.
 */
const MOSAIC =
  /^(minps|maxps|lowps|highps|centerx|centery|category|tag|groupname|productname|zorder|edytowal|utworzyl|data_edycji|data_utworzenia)$/i;
/** ArcGIS writes an empty attribute as the word Null. */
const EMPTY = /^(null|<null>)?$/i;
const SERVICE_ERROR = /ServiceException/;
/** Local servers answer this way when they do not publish the layer: no data here, not a failure. */
const NOT_PUBLISHED = /LayerNotDefined|Invalid layer|layer might be disabled/i;

/**
 * Queryable selected sublayers visible at the current scale; only those are sent. A WMTS has one
 * layer, queryable when the service lists GetFeatureInfo formats; an ArcGIS tile cache is drawn
 * whole, so all its layers are asked about.
 */
export function queryLayers(def: Overlay, selected: string[], scale: number): string[] {
  if (def.kind === 'wmts') return wmtsMeta(def.id)?.infoFormats?.length ? selected : [];
  return infoNames(def, selected).filter((name) => {
    const m = layerMeta(def.id, name);
    // Our own WMS are queried even before their capabilities are known.
    if (!m) return def.kind === 'wms';
    return m.queryable && scale >= (m.minScale ?? 0) && scale <= (m.maxScale ?? Infinity);
  });
}

/** Layers of the overlay that may answer: all of an ArcGIS tile cache (its image is one), else the chosen ones. */
function infoNames(def: Overlay, selected: string[]): string[] {
  const cache = def.kind === 'rest' ? restMeta(def.id) : undefined;
  return cache?.tiles ? Object.keys(cache.layers) : selected;
}

/** A layer that answers at other scales than the map's: the scale to go to, just inside its range, and the range's edge. */
export interface ScaleHint {
  title: string;
  scale: number;
  limit: number;
}

/**
 * When no layer of the overlay answers at this scale: the one that would with the smallest change
 * of scale. Nothing when a layer answers now, or none ever does.
 */
export function nearestQueryable(def: Overlay, selected: string[], scale: number): ScaleHint | undefined {
  if (def.kind === 'wmts') return undefined;
  let best: (ScaleHint & { change: number }) | undefined;
  for (const name of infoNames(def, selected)) {
    const m = layerMeta(def.id, name);
    if (!m?.queryable) continue;
    const max = m.maxScale ?? Infinity;
    const min = m.minScale ?? 0;
    const limit = scale > max ? max : scale < min ? min : undefined;
    if (limit === undefined) return undefined;
    const target = scale > max ? limit * 0.9 : limit * 1.1;
    const change = Math.abs(Math.log(target / scale));
    if (!best || change < best.change) best = { title: m.title, scale: target, limit, change };
  }
  return best && { title: best.title, scale: best.scale, limit: best.limit };
}

/** WMTS answers in HTML tables like WMS; XML comes next, as GML needs more guessing. */
const WMTS_FORMATS = ['text/html', 'text/xml', 'text/plain'];

/** Parameters of the query for the clicked point, in the form the proxy checks for each kind. */
function queryParams(
  def: Overlay,
  layer: OverlayLayer,
  coordinate: number[],
  resolution: number,
  layers: string[],
): URLSearchParams | undefined {
  const source = layer.getSource();
  if (source instanceof ImageWMS) {
    const url = source.getFeatureInfoUrl(coordinate, resolution, PROJECTION, {
      // Non-queryable layers in LAYERS make some servers reject the whole request.
      LAYERS: layers.join(','),
      QUERY_LAYERS: layers.join(','),
      INFO_FORMAT: infoFormat(def.id),
      FEATURE_COUNT: 10,
    });
    return url ? new URL(url).searchParams : undefined;
  }
  if (source instanceof WMTS) {
    // The pixel of the tile under the point, at the level the map shows.
    const grid = source.getTileGrid() as WMTSTileGrid;
    const tile = grid.getTileCoordForCoordAndResolution(coordinate, resolution);
    const extent = grid.getTileCoordExtent(tile);
    const r = grid.getResolution(tile[0]);
    const offered = wmtsMeta(def.id)?.infoFormats ?? [];
    return new URLSearchParams({
      TILEMATRIX: grid.getMatrixId(tile[0]),
      TILECOL: String(tile[1]),
      TILEROW: String(tile[2]),
      I: String(Math.floor((coordinate[0] - extent[0]) / r)),
      J: String(Math.floor((extent[3] - coordinate[1]) / r)),
      INFOFORMAT: WMTS_FORMATS.find((f) => offered.includes(f)) ?? offered[0] ?? 'text/html',
    });
  }
  // ArcGIS identify: the point in the middle of a 100-pixel window at the map's resolution.
  const [x, y] = coordinate;
  const half = 50 * resolution;
  return new URLSearchParams({
    QUERY_LAYERS: layers.join(','),
    BBOX: [x - half, y - half, x + half, y + half].join(','),
    WIDTH: '100',
    HEIGHT: '100',
    I: '50',
    J: '50',
  });
}

export async function fetchFeatureInfo(
  def: Overlay,
  layer: OverlayLayer,
  coordinate: number[],
  resolution: number,
  layers: string[],
  signal: AbortSignal,
): Promise<InfoRecord[]> {
  const params = queryParams(def, layer, coordinate, resolution, layers);
  if (!params) return [];
  const ask = () => fetch(`/api/featureinfo/${encodeURIComponent(def.id)}?${params.toString()}`, { signal });
  let res = await ask();
  // Some servers list XML among their formats and then fail on it: one more try in HTML.
  if (res.status === 502 && params.has('INFO_FORMAT') && params.get('INFO_FORMAT') !== 'text/html') {
    params.set('INFO_FORMAT', 'text/html');
    res = await ask();
  }
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

/** Readable name for a technical attribute name, when the deployment gives one (i18n: info.fields). */
const fieldName = (label: string) => {
  const key = `info.fields.${label}`;
  const name = t(key);
  return name === key ? label : name;
};

/** A field whose value is a web address links to it. */
const linked = (label: string, value: string): InfoField =>
  /^https?:\/\/\S+$/i.test(value) ? { label, value, href: value } : { label, value };

/**
 * One field from a table cell, or from a text value that may itself be markup (Intergraph
 * wraps links and QR codes in CDATA).
 */
function field(label: string, raw: string | Element): InfoField | null {
  label = clean(label);
  if (!label || HIDDEN.test(label)) return null;
  label = fieldName(label);
  const el = typeof raw === 'string' ? (/<[a-z]/i.test(raw) ? parseHtmlFragment(raw).body : undefined) : raw;
  if (el) {
    const href = el.querySelector('a[href]')?.getAttribute('href') ?? '';
    const text = clean(el.textContent);
    if (EMPTY.test(text)) return null;
    if (/^https?:/i.test(href)) return { label, value: text || t('info.open'), href };
    return text ? linked(label, text) : null;
  }
  const value = clean(raw as string); // Not an element: that branch returned above.
  return value && !EMPTY.test(value) ? linked(label, value) : null;
}

/** ArcGIS titles look like "FeatureInfoCollection - layer name: 'Przeznaczenia MPZP'". */
function cleanTitle(title: string | undefined): string | undefined {
  const t = clean(title)
    .replace(/^FeatureInfoCollection\s*-\s*layer name:\s*/i, '')
    .replace(/^warstwa:\s*/i, '')
    .replace(/^['"]|['"]$/g, '');
  return t || undefined;
}

function push(records: InfoRecord[], title: string | undefined, fields: (InfoField | null)[]) {
  const all = fields.filter((f): f is InfoField => f !== null);
  // Overview images of a mosaic are its own previews, not map sheets.
  if (all.some((f) => /^category$/i.test(f.label) && f.value === 'Overview')) return;
  const kept = all.filter((f) => !MOSAIC.test(f.label));
  if (kept.length > 0) records.push({ title: cleanTitle(title), fields: kept });
}

/** Nearest heading before an element, used as the record title. */
function headingBefore(el: Element): string | undefined {
  for (let n: Element | null = el.previousElementSibling; n; n = n.previousElementSibling) {
    if (/^H[1-6]$/.test(n.tagName)) return n.textContent ?? undefined;
  }
  return undefined;
}

/** A label and its value on one line: "Numer okregu - 39", "Siedziba komisji: PŁOCK". */
const LINE = /^(.{1,80}?)\s*(?::|\s-\s)\s*(.+)$/s;
/** Sections of GUGiK's page templates about the service itself, not the place clicked. */
const SERVICE_SECTION = /^pozostałe informacje$/i;
/** Where a value written after a bold label ends. */
const VALUE_END = /^(BR|B|STRONG|HR|DIV|P|TABLE|UL|OL|H[1-6])$/;

/**
 * One row of a one-column table: a download link keeps its name, a "label: value" line is split,
 * anything else is a value under the table's heading.
 */
function lineField(cell: Element, heading: string): InfoField | null {
  const text = clean(cell.textContent);
  const href = cell.querySelector('a[href]')?.getAttribute('href') ?? '';
  if (/^https?:/i.test(href) && clean(cell.querySelector('a[href]')?.textContent) === text) {
    return text ? { label: text, value: t('info.open'), href } : null;
  }
  const line = LINE.exec(text);
  return line ? field(line[1], line[2]) : field(heading, cell);
}

/** Title of a list: its heading, after the name of the folded section it is in (GUGiK's accordions). */
function listTitle(list: Element): string | undefined {
  const header = list.closest('.accordion-content')?.previousElementSibling;
  // Its pieces are lines (separate spans and breaks): joined with spaces, without the fold arrow.
  const pieces: string[] = [];
  if (header)
    for (const walker = list.ownerDocument.createTreeWalker(header, NodeFilter.SHOW_TEXT); walker.nextNode();)
      pieces.push(walker.currentNode.textContent ?? '');
  const section = clean(pieces.join(' ').replace(/[▼▲]/g, ''));
  return [section, clean(headingBefore(list))].filter(Boolean).join(' – ') || undefined;
}

function parseHtml(doc: Document): InfoRecord[] {
  const records: InfoRecord[] = [];
  for (const table of doc.querySelectorAll('table')) {
    const rows = [...table.querySelectorAll('tr')];
    const header = rows[0] ? [...rows[0].querySelectorAll('th')] : [];
    const title = headingBefore(table);
    const cells = rows.map((row) => [...row.querySelectorAll('th, td')]);
    if (cells.every((c) => c.length <= 1)) {
      // One-column table: a heading over lines (district facts, files to download), or ArcGIS's
      // one attribute (a pixel value) under its name.
      const head = header.length === 1 && cells[0].length === 1 ? clean(header[0].textContent) : '';
      const lines = (head ? cells.slice(1) : cells).flat();
      if (head && lines.length === 1) push(records, title, [field(head, lines[0])]);
      else
        push(
          records,
          head || title,
          lines.map((cell) => lineField(cell, head || clean(title))),
        );
      continue;
    }
    if (header.length > 1 && rows.length > 1) {
      // Column table: one record per data row.
      for (const row of rows.slice(1)) {
        const cells = [...row.querySelectorAll('td')];
        push(
          records,
          title,
          cells.map((td, i) => field(header[i]?.textContent ?? '', td)),
        );
      }
    } else {
      // Key/value table: two cells per row.
      push(
        records,
        title,
        rows.map((row) => {
          const cells = [...row.querySelectorAll('th, td')];
          return cells.length >= 2 ? field(cells[0].textContent ?? '', cells[1]) : null;
        }),
      );
    }
  }
  // Lists of "<span>label</span> value" (GUGiK's own page templates: BHMW, NFZ, air quality).
  for (const list of doc.querySelectorAll('ul, ol')) {
    if (SERVICE_SECTION.test(clean(headingBefore(list)))) continue;
    const fields = [...list.children].map((item) => {
      const label = item.firstElementChild;
      if (item.tagName !== 'LI' || !label?.matches('span, b, strong') || !clean(item.textContent).startsWith(clean(label.textContent))) {
        return null;
      }
      const value = item.cloneNode(true) as Element;
      value.firstElementChild!.remove();
      return field(label.textContent ?? '', value);
    });
    push(records, listTitle(list), fields);
  }
  // Pairs of field name and value elements (ArcGIS indexes: "item-fieldname", "item-fieldvalue").
  const pairs = new Map<Element, (InfoField | null)[]>();
  for (const name of doc.querySelectorAll('[class*="fieldname"]')) {
    const value = name.nextElementSibling;
    if (!name.parentElement || !value?.className.includes('fieldvalue')) continue;
    pairs.set(name.parentElement, [...(pairs.get(name.parentElement) ?? []), field(name.textContent ?? '', value)]);
  }
  for (const [parent, fields] of pairs) push(records, headingBefore(parent), fields);
  // "<b>Label:</b> value<br>" lines (MapServer templates), also one to a paragraph, gathered by
  // the box they are in under its heading; a label met again starts a new record.
  const lines = new Map<Element, { title?: string; fields: InfoField[] }[]>();
  for (const bold of doc.querySelectorAll('b, strong')) {
    const line = bold.parentElement?.tagName === 'P' ? bold.parentElement : bold;
    const box = line.parentElement;
    if (!box || bold.closest('table, li, button, h1, h2, h3, h4, h5, h6, [class*="fieldname"]')) continue;
    const value = doc.createElement('span');
    for (let n = bold.nextSibling; n && !(n.nodeType === Node.ELEMENT_NODE && VALUE_END.test((n as Element).tagName)); n = n.nextSibling) {
      value.append(n.cloneNode(true));
    }
    const f = field(clean(bold.textContent).replace(/:$/, ''), value);
    if (!f) continue;
    const groups = lines.get(box) ?? [];
    lines.set(box, groups);
    const last = groups[groups.length - 1];
    if (last && !last.fields.some((g) => g.label === f.label)) last.fields.push(f);
    else groups.push({ title: headingBefore(line), fields: [f] });
  }
  for (const groups of lines.values()) for (const { title, fields } of groups) push(records, title, fields);
  return records;
}

function parseXml(doc: Document): InfoRecord[] {
  const records: InfoRecord[] = [];
  // Intergraph GeoMedia (KIEG, KIUT): <Layer Name><Attribute Name>value</Attribute></Layer>
  const attrLayers = [...doc.getElementsByTagName('Layer')].filter((l) => l.getElementsByTagName('Attribute').length);
  if (attrLayers.length > 0) {
    for (const layer of attrLayers) {
      const attrs = [...layer.getElementsByTagName('Attribute')];
      push(
        records,
        undefined,
        attrs.map((a) => field(a.getAttribute('Name') ?? '', a.textContent ?? '')),
      );
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
    groups.set(parent, groups.get(parent) ?? []);
    groups.get(parent)!.push(f);
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

interface IdentifyResponse {
  error?: unknown;
  results?: { layerName?: string; attributes?: Record<string, unknown> }[];
}

/** ArcGIS identify: one record per feature, titled with its layer. */
function parseIdentify(response: IdentifyResponse): InfoRecord[] {
  if (response.error) throw new Error('The service rejected the query');
  const records: InfoRecord[] = [];
  for (const r of response.results ?? []) {
    push(
      records,
      r.layerName,
      Object.entries(r.attributes ?? {}).map(([label, value]) => field(label, String(value ?? ''))),
    );
  }
  return records;
}

function parseAny(body: string, contentType: string): InfoRecord[] {
  if (!body.trim() || NOT_PUBLISHED.test(body)) return [];
  if (/json/i.test(contentType) || body.trimStart().startsWith('{')) return parseIdentify(JSON.parse(body) as IdentifyResponse);
  if (SERVICE_ERROR.test(body)) throw new Error('The service rejected the query');
  const xml = /xml|gml/i.test(contentType) || body.trimStart().startsWith('<?xml');
  if (xml) {
    const doc = new DOMParser().parseFromString(body, 'application/xml');
    // County servers behind an integration may send a well-formed HTML page labelled as XML.
    if (!doc.querySelector('parsererror') && doc.documentElement.localName.toLowerCase() !== 'html') return parseXml(doc);
  }
  // HTML with no labelled values is a server's own page (help text, empty templates), not feature data.
  return parseHtml(parseHtmlFragment(body));
}
