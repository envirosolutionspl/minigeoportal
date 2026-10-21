/**
 * Map state lives in the URL query so every view is a shareable link:
 * ?x=637000&y=486000&z=12&b=orto&l=kieg-dzialki,kimpzp
 */

export interface UrlState {
  center?: [number, number];
  zoom?: number;
  base?: string;
  overlays?: string[];
}

export function readUrl(): UrlState {
  const q = new URLSearchParams(window.location.search);
  const x = Number(q.get('x'));
  const y = Number(q.get('y'));
  const z = Number(q.get('z'));
  const state: UrlState = {};
  if (Number.isFinite(x) && Number.isFinite(y) && q.has('x') && q.has('y')) state.center = [x, y];
  if (Number.isFinite(z) && q.has('z')) state.zoom = z;
  const b = q.get('b');
  if (b) state.base = b;
  const l = q.get('l');
  if (l !== null) state.overlays = l ? l.split(',') : [];
  return state;
}

let pending: number | undefined;

export function writeUrl(state: Required<UrlState>): void {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    const q = new URLSearchParams();
    q.set('x', Math.round(state.center[0]).toString());
    q.set('y', Math.round(state.center[1]).toString());
    q.set('z', state.zoom.toFixed(1));
    q.set('b', state.base);
    q.set('l', state.overlays.join(','));
    window.history.replaceState(null, '', `?${q.toString()}`);
  }, 250);
}
