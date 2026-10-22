import { PROJECTION } from '@/map/projection';

/**
 * Map state lives in the URL query so every view is a shareable link:
 * ?x=637000&y=486000&z=12&b=orto&l=kieg,kiut.przewod_wodociagowy.przewod_gazowy
 * An overlay without sublayers uses its defaults.
 */

interface UrlState {
  center: [number, number];
  zoom: number;
  base: string;
  overlays: string[];
  /** Custom sublayer selection per overlay; absent means defaults. */
  sublayers: Record<string, string[]>;
}

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
      const [id, ...subs] = part.split('.');
      state.overlays.push(id);
      if (subs.length > 0) state.sublayers[id] = subs;
    }
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
  q.set('l', state.overlays.map((id) => [id, ...(state.sublayers[id] ?? [])].join('.')).join(','));
  return `?${q.toString().replace(/%2C/g, ',')}`;
}

/** Full link to a view, for sharing: the same page with the view in the query. */
export const linkFor = (state: UrlState) => `${window.location.origin}${window.location.pathname}${queryFor(state)}`;

let pending: number | undefined;

export function writeUrl(state: UrlState): void {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => window.history.replaceState(null, '', queryFor(state)), 250);
}
