import { RequestError, fetchFixed, readLimited } from '../../http.ts';
import type { OrthoInfo, OrthoSheet } from '../../../src/services/ortho.ts';
export type { OrthoInfo };

/**
 * When and how sharp the aerial photo is at a point, from the GUGiK orthophoto index
 * (skorowidze ortofotomap). The index answers GetFeatureInfo only as an HTML page that carries
 * the sheet records as JavaScript object literals; they are read here with a strict pattern,
 * never executed, and only the fields the app shows are passed on.
 */

const INDEX = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/SkorowidzeWgAktualnosci';
/** Sheet layers per year, newest first; the service adds a layer each year, so the list is read from it. */
const FALLBACK_LAYERS = [
  'SkorowidzeOrtofotomapy2026',
  'SkorowidzeOrtofotomapy2025',
  'SkorowidzeOrtofotomapy2024',
  'SkorowidzeOrtofotomapyStarsze',
];
const LAYERS_TTL_MS = 24 * 3600 * 1000;
const TIMEOUT_MS = 10000;
const MAX_BYTES = 1_000_000;
/** EPSG:2180 extent of Poland with a margin. */
const BOUNDS = { minX: 100000, maxX: 900000, minY: 100000, maxY: 850000 };
const DOWNLOAD_HOST = 'opendata.geoportal.gov.pl';

/** After a failed read the fallback list is used, and the index is asked again after this long. */
const RETRY_AFTER_FAILURE_MS = 10 * 60000;
let layers: { names: string[]; at: number } | undefined;
let loading: Promise<string[]> | undefined;

/** Index layers (one per year): read from the service once a day, shared by concurrent clicks. */
function sheetLayers(): Promise<string[]> {
  if (layers && Date.now() - layers.at < LAYERS_TTL_MS) return Promise.resolve(layers.names);
  loading ??= (async () => {
    try {
      const res = await fetchFixed(`${INDEX}?SERVICE=WMS&REQUEST=GetCapabilities`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const xml = new TextDecoder().decode(await readLimited(res, MAX_BYTES));
      const names = [...new Set(xml.match(/SkorowidzeOrtofotomapy(?:\d{4}|Starsze)(?=<)/g) ?? [])];
      layers = { names: names.length > 0 ? names : FALLBACK_LAYERS, at: Date.now() };
    } catch {
      layers = { names: FALLBACK_LAYERS, at: Date.now() - LAYERS_TTL_MS + RETRY_AFTER_FAILURE_MS };
    } finally {
      loading = undefined;
    }
    return layers.names;
  })();
  return loading;
}

const RECORD = /skorDo5cm\.push\(\{([^{}]*)\}\);/g;
const FIELD = /(\w+):"([^"]*)"/g;

/** Sheet records from the index page; anything not matching the expected shape is skipped. */
export function parseIndex(html: string): OrthoSheet[] {
  return [...html.matchAll(RECORD)].flatMap(([, body]) => {
    const f = Object.fromEntries([...body.matchAll(FIELD)].map(([, k, v]) => [k, v]));
    const pixel = Number(f.wielkoscPiksela);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.aktualnosc ?? '') || !(pixel > 0 && pixel < 10)) return [];
    let download: string | undefined;
    try {
      const url = new URL(f.url ?? '');
      if (url.protocol === 'https:' && url.hostname === DOWNLOAD_HOST && url.pathname.endsWith('.tif')) download = url.href;
    } catch {
      // No usable link.
    }
    const size = Number(f.rozmiarPlikuMB);
    return [
      {
        date: f.aktualnosc,
        pixel,
        color: /^(RGB|CIR|B\/W|PAN)$/.test(f.kolor ?? '') ? f.kolor : 'inny',
        sheet: (f.godlo ?? '').slice(0, 40),
        download,
        sizeMb: Number.isFinite(size) && size > 0 ? size : undefined,
      },
    ];
  });
}

/** The photo shown on the map: newest in natural colour, the sharpest of that day. */
export function latestPhoto(sheets: OrthoSheet[]): OrthoSheet | undefined {
  return sheets.filter((s) => s.color === 'RGB').sort((a, b) => b.date.localeCompare(a.date) || a.pixel - b.pixel)[0];
}

/** Aerial photo at a point of Poland (PL-1992); a point outside it is a RequestError. */
export async function orthoAt(xParam: string | undefined, yParam: string | undefined, abort?: AbortSignal): Promise<OrthoInfo> {
  const x = Number(xParam);
  const y = Number(yParam);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < BOUNDS.minX || x > BOUNDS.maxX || y < BOUNDS.minY || y > BOUNDS.maxY) {
    throw new RequestError('Invalid point');
  }
  const names = (await sheetLayers()).join(',');
  // A 2 m box around the point, queried at its centre pixel; WMS 1.3.0 in EPSG:2180 is northing first.
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetFeatureInfo',
    VERSION: '1.3.0',
    LAYERS: names,
    QUERY_LAYERS: names,
    STYLES: '',
    CRS: 'EPSG:2180',
    BBOX: [y - 1, x - 1, y + 1, x + 1].map((v) => v.toFixed(2)).join(','),
    WIDTH: '3',
    HEIGHT: '3',
    I: '1',
    J: '1',
    INFO_FORMAT: 'text/html',
    FEATURE_COUNT: '100',
  });
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetchFixed(`${INDEX}?${params}`, { signal: abort ? AbortSignal.any([deadline, abort]) : deadline });
  const sheets = parseIndex(new TextDecoder().decode(await readLimited(res, MAX_BYTES)));
  return { latest: latestPhoto(sheets), archived: sheets.length };
}
