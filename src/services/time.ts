import type { Overlay } from '@/config/runtime';
import { layerMeta } from './meta';

/**
 * Layers that change over time (layers.yaml: `time`). A WMS or WMTS dimension is one service
 * asked for one value at a time (TIME=2020); a series is one service or layer per edition. The
 * map draws the current value; choosing another one is left to a future time view.
 */

/** Most values a layer offers: a long range with a short step is cut here. */
const MAX_VALUES = 1000;

export interface TimeValues {
  /** Request parameter (TIME, DIM_…); none for a series, whose editions are separate services. */
  param?: string;
  values: string[];
  /** The value drawn: the configured one, the service's default, or the newest. */
  current: string;
}

const PERIOD = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Dates from `start` to `end` by an ISO 8601 period of years, months or days (P1Y, P6M, P10D), in
 * the precision of `start`: 2015, 2015-06 or 2015-06-01.
 */
export function expandRange(start: string, end: string, step: string): string[] {
  const period = PERIOD.exec(step);
  const parts = start.split('-').map(Number);
  if (!period || !period.slice(1).some(Boolean) || parts.some((n) => !Number.isFinite(n))) return [start, end];
  const [years, months, days] = period.slice(1).map((n) => Number(n ?? 0));
  const format = (d: Date) => [String(d.getUTCFullYear()), pad(d.getUTCMonth() + 1), pad(d.getUTCDate())].slice(0, parts.length).join('-');
  const out: string[] = [];
  for (let i = 0; out.length < MAX_VALUES; i++) {
    const date = new Date(Date.UTC(parts[0] + i * years, (parts[1] ?? 1) - 1 + i * months, (parts[2] ?? 1) + i * days));
    const value = format(date);
    if (value > end) break;
    out.push(value);
  }
  return out;
}

/** A list as WMS capabilities give it: values and start/end/period ranges, separated by commas. */
export function parseValues(list: string): string[] {
  return list.split(',').flatMap((v) => {
    const [start, end, step] = v.trim().split('/');
    return end && step ? expandRange(start, end, step) : [start];
  });
}

/** The name capabilities give a dimension: TIME is time, DIM_ELEVATION is elevation. */
const dimensionName = (param: string) => param.replace(/^DIM_/i, '').toLowerCase();

export function timeValues(def: Overlay): TimeValues | undefined {
  const time = def.time;
  if (!time) return undefined;
  if (time.type === 'series') {
    const values = time.editions.map((e) => e.value);
    return { values, current: values[values.length - 1] };
  }
  let values: string[];
  let fallback: string | undefined;
  if (time.values === 'capabilities') {
    const dimension = layerMeta(def.id, def.sublayers[0].name)?.dimensions?.[dimensionName(time.param)];
    values = dimension ? parseValues(dimension.values) : [];
    fallback = dimension?.default;
  } else {
    values = Array.isArray(time.values) ? time.values : expandRange(time.values.start, time.values.end, time.values.step);
  }
  const current = time.default ?? fallback ?? values[values.length - 1];
  return current === undefined ? undefined : { param: time.param, values, current };
}
