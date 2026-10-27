import { locale, t } from '@/i18n';
import type { TimeOption } from '@/modules';
import { pointInfo } from './ortho';

/** A sheet of the old topographic maps at a point, from the backend (GUGiK index of topographic maps). */
export interface TopoSheet {
  /** When the sheet is current for: a year, or a fuller date. */
  date: string;
  /** Scale denominator: 10000, 25000 or 50000. */
  scale: number;
  /** System of coordinates the sheet was made in: 1942, 1965 or 1992 (a name, not a year). */
  system: string;
  /** Layer of the map service that draws the sheet. */
  layer: string;
  sheet: string;
  name?: string;
}

export interface TopoInfo {
  /** Sheets at the point, oldest first, the coarser scale first on a day. */
  sheets: TopoSheet[];
}

export const topoAt = (point: [number, number], signal: AbortSignal) => pointInfo<TopoInfo>('/api/topo', point, signal);

/**
 * The dates of the old maps at a point for the time bar: one per day, drawing every sheet of
 * that day (coarser first, so the finer lies on top), named by their scales and systems.
 */
export async function timeOptionsAt(coordinate: [number, number], signal: AbortSignal): Promise<TimeOption[]> {
  const { sheets } = await topoAt(coordinate, signal);
  const byDate = new Map<string, TopoSheet[]>();
  for (const s of sheets ?? []) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const scales = new Intl.NumberFormat(locale());
  return [...byDate].map(([date, day]) => ({
    value: date,
    layer: day.map((s) => s.layer).join(','),
    detail: day.map((s) => t('topo.sheet', { scale: scales.format(s.scale), system: s.system })).join(' · '),
  }));
}
