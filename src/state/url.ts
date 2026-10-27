import { PROJECTION } from '@/map/projection';

/**
 * Map state lives in the URL query so every view is a shareable link:
 * ?x=637000&y=486000&z=12&b=orto&l=kieg,kiut.przewod_wodociagowy.przewod_gazowy&t=2007-01-01&c=1&tl=mapy-dawne&a=1
 * An overlay without sublayers uses its defaults. `t` is the date of the time view, which the
 * link then opens; `c=1` compares it with the present behind a curtain; `tl` names the view's
 * layer when it is not the first; `a=1` draws what was added after the date.
 */

interface UrlState {
  center: [number, number];
  zoom: number;
  base: string;
  overlays: string[];
  /** Custom sublayer selection per overlay; absent means defaults. */
  sublayers: Record<string, string[]>;
  /** Date shown in the time view; absent when the view is closed. */
  time?: string;
  /** The time view compares its date with the present. */
  compare?: boolean;
  /** The time view's layer, when not the first. */
  timeLayer?: string;
  /** The time view draws what was added after its date. */
  timeAdded?: boolean;
}

/** An overlay id as links carry it. */
const ID = /^[a-z0-9][a-z0-9_.-]*$/i;

/** A date of the time view as links carry it: 2007, 2007-01 or 2007-01-01. */
const DATE = /^\d{4}(-\d{2}){0,2}$/;

export function readUrl(): Partial<UrlState> {
  const q = new URLSearchParams(window.location.search);
  const state: Partial<UrlState> = {};
  const num = (key: string) => {
    const v = q.get(key);
    return v ? Number(v) : NaN;
  };
  const [x, y, z] = [num('x'), num('y'), num('z')];
  if (Number.isFinite(x) && Number.isFinite(y)) state.center = [x, y];
  if (Number.isFinite(z)) state.zoom = z;
  const b = q.get('b');
  if (b) state.base = b;
  const l = q.get('l');
  if (l !== null) {
    state.overlays = [];
    state.sublayers = {};
    for (const part of l.split(',').filter(Boolean)) {
      // A dot inside a name (a catalog layer) travels as %2E (see queryFor).
      const [id, ...subs] = part.split('.').map((s) => s.replace(/%2E/gi, '.'));
      state.overlays.push(id);
      if (subs.length > 0) state.sublayers[id] = subs;
    }
  }
  const time = q.get('t');
  if (time && DATE.test(time)) {
    state.time = time;
    if (q.get('c') === '1') state.compare = true;
    const layer = q.get('tl');
    if (layer && ID.test(layer)) state.timeLayer = layer;
    if (q.get('a') === '1') state.timeAdded = true;
  }
  return state;
}

/** Metres to the metre; degrees (a geographic map) to about a metre. */
const DIGITS = PROJECTION.getUnits() === 'degrees' ? 5 : 0;

/** Query string of a view, e.g. "?x=637000&y=486000&z=12.0&b=orto&l=kieg". */
function queryFor(state: UrlState): string {
  const q = new URLSearchParams();
  q.set('x', state.center[0].toFixed(DIGITS));
  q.set('y', state.center[1].toFixed(DIGITS));
  q.set('z', state.zoom.toFixed(1));
  q.set('b', state.base);
  const named = (s: string) => s.replace(/\./g, '%2E');
  q.set('l', state.overlays.map((id) => [id, ...(state.sublayers[id] ?? [])].map(named).join('.')).join(','));
  if (state.time) q.set('t', state.time);
  if (state.time && state.compare) q.set('c', '1');
  if (state.time && state.timeLayer) q.set('tl', state.timeLayer);
  if (state.time && state.timeAdded) q.set('a', '1');
  return `?${q.toString().replace(/%2C/g, ',')}`;
}

/** Full link to a view, for sharing: the same page with the view in the query. */
export const linkFor = (state: UrlState) => `${window.location.origin}${window.location.pathname}${queryFor(state)}`;

let pending: number | undefined;

export function writeUrl(state: UrlState): void {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => window.history.replaceState(null, '', queryFor(state)), 250);
}
