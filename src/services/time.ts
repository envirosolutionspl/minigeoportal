import type { Overlay } from '@/config/runtime';
import { layerMeta } from './meta';

/**
 * Layers that change over time (layers.yaml: `time`). A WMS or WMTS dimension is one service
 * asked for one value at a time (TIME=2020); a series is one service or layer per edition. The
 * map draws the current value; the time view (map.yaml: timeTravel) lets people choose another.
 */

/** Most values a layer offers: a long range with a short step is cut here. */
const MAX_VALUES = 1000;

export interface TimeValues {
  /** Request parameter (TIME, DIM_…); none for a series, whose editions are separate services or layers. */
  param?: string;
  values: string[];
  /** Of a series: the sublayers each edition draws (comma-separated, as a WMS lists them) and what to call it. */
  editions?: Record<string, { layer?: string; label?: string }>;
  /** The value drawn: the configured one, the service's default, or the newest; none while the service's values are not known yet. */
  current?: string;
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

/** A date at midnight as some servers write it (2015-01-01T00:00:00.000Z) is the date. */
const day = (value: string) => value.replace(/T00:00:00(?:\.0+)?Z$/, '');

/**
 * The values of each list read so far: a list is asked for on every render of the time bar, and a
 * range of decades by the month is hundreds of dates; the same array lets the bar keep what it
 * made of it.
 */
const parsed = new Map<string, string[]>();

/** A list as WMS capabilities give it: values and start/end/period ranges, separated by commas. */
export function parseValues(list: string): string[] {
  let values = parsed.get(list);
  if (!values) {
    values = list.split(',').flatMap((v) => {
      const [start, end, step] = v.trim().split('/').map(day);
      return end && step ? expandRange(start, end, step) : [start];
    });
    parsed.set(list, values);
  }
  return values;
}

/** The name capabilities give a dimension: TIME is time, DIM_ELEVATION is elevation. */
const dimensionName = (param: string) => param.replace(/^DIM_/i, '').toLowerCase();

export function timeValues(def: Overlay): TimeValues | undefined {
  const time = def.time;
  if (!time) return undefined;
  if (time.type === 'series') {
    const values = time.editions.map((e) => e.value);
    const editions = Object.fromEntries(
      time.editions.map((e) => [e.value, { ...(e.layer ? { layer: e.layer } : {}), ...(e.label ? { label: e.label } : {}) }]),
    );
    return { values, current: values[values.length - 1], editions };
  }
  let values: string[];
  let fallback: string | undefined;
  if (time.values === 'capabilities') {
    const dimension = layerMeta(def.id, def.sublayers[0].name)?.dimensions?.[dimensionName(time.param)];
    values = dimension ? parseValues(dimension.values) : [];
    fallback = dimension?.default;
  } else {
    // A configured range is read as a capabilities range: once, for the same reasons.
    values = Array.isArray(time.values) ? time.values : parseValues(`${time.values.start}/${time.values.end}/${time.values.step}`);
  }
  // Without the capabilities (not read yet) the layer draws without the parameter: the service's own default.
  const current = time.default ?? fallback ?? values[values.length - 1];
  return { param: time.param, values, ...(current !== undefined ? { current } : {}) };
}

/**
 * The value a time layer shows for a wanted date: the latest value not after it, as a WMS with a
 * time dimension answers (a photo taken on or before the date), else the first one.
 */
export function valueAt(values: string[], wanted: string): string | undefined {
  let found: string | undefined;
  for (const v of values) {
    if (v > wanted) break;
    found = v;
  }
  return found ?? values[0];
}

/** Values a slider can hold: of a monthly or daily list, the first value of each year. */
export function yearly(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const year = v.slice(0, 4);
    if (seen.has(year)) return false;
    seen.add(year);
    return true;
  });
}
