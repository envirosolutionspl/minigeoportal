import { fetchText } from '../../http.ts';
import { indexAt } from './sheetIndex.ts';
import type { OrthoEdition, OrthoInfo, OrthoSheet } from '../../../src/modules/gugik/ortho.ts';
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
      const xml = await fetchText(`${INDEX}?SERVICE=WMS&REQUEST=GetCapabilities`, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES });
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

/** The natural-colour photos of a point by date, oldest first, the sharpest of each day: the dates the time view offers. */
export function photoHistory(sheets: OrthoSheet[]): OrthoEdition[] {
  const byDate = new Map<string, number>();
  for (const s of sheets) {
    if (s.color !== 'RGB') continue;
    byDate.set(s.date, Math.min(byDate.get(s.date) ?? Infinity, s.pixel));
  }
  return [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, pixel]) => ({ date, pixel }));
}

/** Aerial photo at a point of Poland (PL-1992); a point outside it is a RequestError. */
export async function orthoAt(x: number, y: number, abort?: AbortSignal): Promise<OrthoInfo> {
  const sheets = parseIndex(await indexAt(INDEX, sheetLayers, x, y, 100, abort));
  return { latest: latestPhoto(sheets), archived: sheets.length, history: photoHistory(sheets) };
}
