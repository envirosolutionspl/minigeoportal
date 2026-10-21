/**
 * Map state lives in the URL query so every view is a shareable link:
 * ?x=637000&y=486000&z=12&b=orto&l=kieg,kiut.przewod_wodociagowy.przewod_gazowy
 * An overlay without sublayers uses its defaults.
 */

export interface UrlState {
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
  const x = Number(q.get('x'));
  const y = Number(q.get('y'));
  const z = Number(q.get('z'));
  if (q.has('x') && q.has('y') && Number.isFinite(x) && Number.isFinite(y)) state.center = [x, y];
  if (q.has('z') && Number.isFinite(z)) state.zoom = z;
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

let pending: number | undefined;

export function writeUrl(state: UrlState): void {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    const q = new URLSearchParams();
    q.set('x', Math.round(state.center[0]).toString());
    q.set('y', Math.round(state.center[1]).toString());
    q.set('z', state.zoom.toFixed(1));
    q.set('b', state.base);
    q.set('l', state.overlays.map((id) => [id, ...(state.sublayers[id] ?? [])].join('.')).join(','));
    window.history.replaceState(null, '', `?${q.toString().replace(/%2C/g, ',')}`);
  }, 250);
}
