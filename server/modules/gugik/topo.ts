import { indexAt } from './sheetIndex.ts';
import type { TopoInfo, TopoSheet } from '../../../src/modules/gugik/topo.ts';
export type { TopoInfo };

/**
 * The sheets of the old topographic maps at a point, from the GUGiK index of topographic maps
 * (skorowidz map topograficznych): which systems and scales cover the place and what year each
 * sheet is current for. 1942, 1965 and 1992 name systems of coordinates, not years: a sheet in the
 * 1942 system may be current for 1993. The index answers GetFeatureInfo only as HTML; the fields
 * the app shows are read with strict patterns, nothing else is passed on.
 */

const INDEX = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/mapy/WMS/SkorowidzMapTopograficznych';
/** Index layer by the system and the scale of its sheets, and the layer of the map service that draws them. */
export const SHEETS: { index: string; system: string; scale: number; layer: string }[] = [
  { index: 'topo_10_42', system: '1942', scale: 10000, layer: 'Raster_10_1942' },
  { index: 'topo_10_65', system: '1965', scale: 10000, layer: 'Raster_10_1965' },
  { index: 'topo_10_92', system: '1992', scale: 10000, layer: 'Raster_10_1992' },
  { index: 'topo_25_65', system: '1965', scale: 25000, layer: 'Raster_25_1965' },
  { index: 'topo_50_42', system: '1942', scale: 50000, layer: 'Raster_50_1942' },
  { index: 'topo_50_65', system: '1965', scale: 50000, layer: 'Raster_50_1965' },
  { index: 'topo_50_92', system: '1992', scale: 50000, layer: 'Raster_50_1992' },
];

/** One sheet of the index page: its heading names the sheet and the system, the rows its scale and currency. */
const SHEET = /Arkusz\s+([^\s<]{1,40})\s+Uk\S{1,3}ad PL-(\d{4})<\/th>([\s\S]*?)<\/table>/g;
const ROW = (label: RegExp) => new RegExp(`${label.source}:<\\/th>\\s*<td>(?:<a[^>]*>)?([^<]*)`);
const SCALE = ROW(/Skala/);
const CURRENT = ROW(/Aktualno\S{1,3}\S{1,3} kartograficzna/);
const NAME = ROW(/Nazwa arkusza/);

/** Sheet records from the index page; anything not matching the expected shape is skipped. */
export function parseIndex(html: string): TopoSheet[] {
  return [...html.matchAll(SHEET)].flatMap(([, sheet, system, body]) => {
    const scale = Number((SCALE.exec(body)?.[1] ?? '').replace(/^1:/, '').replace(/\s/g, ''));
    const date = CURRENT.exec(body)?.[1].trim() ?? '';
    const known = SHEETS.find((s) => s.system === system && s.scale === scale);
    if (!known || !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(date)) return [];
    const name = NAME.exec(body)?.[1].trim().slice(0, 60);
    return [{ date, scale, system, layer: known.layer, sheet, ...(name ? { name } : {}) }];
  });
}

/** Sheets of a point of Poland (PL-1992), oldest first, coarser scales first on a day; a point outside it is a RequestError. */
export async function topoAt(x: number, y: number, abort?: AbortSignal): Promise<TopoInfo> {
  const sheets = parseIndex(await indexAt(INDEX, () => SHEETS.map((s) => s.index), x, y, 50, abort));
  sheets.sort((a, b) => a.date.localeCompare(b.date) || b.scale - a.scale);
  return { sheets };
}
