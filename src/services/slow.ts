import { config } from '@/config/runtime';
import { useStatusStore } from './status';

/** A tile or an image of a layer, as OpenLayers' load events give it. */
export interface Load {
  getState(): number;
}

/** TileState.LOADING and ImageState.LOADING: a load OpenLayers dropped (panned away) is no longer it. */
const LOADING = 1;
/** How often the waiting loads are looked at while there are any. */
const CHECK_MS = 1000;

/** Loads under way, by layer, with the time each one started. */
const pending = new Map<string, Map<Load, number>>();
let timer: number | undefined;

/**
 * Layers whose data is long in coming (map.yaml: slowLoad seconds): a tile or an image asked for
 * that long ago and not here yet. Measured in the browser, where the waiting is: the layers come
 * straight from their services, and how fast depends on the place (county servers behind the
 * integration services). OpenLayers drops a load without an event when the view moves on, so the
 * loads are looked at once a second while any wait, and a dropped one is let go.
 */
function check(now = Date.now()): void {
  window.clearTimeout(timer);
  timer = undefined;
  const slow: string[] = [];
  for (const [id, loads] of pending) {
    for (const [load, started] of loads) {
      if (load.getState() !== LOADING) loads.delete(load);
      else if (now - started >= config.map.slowLoad * 1000 && !slow.includes(id)) slow.push(id);
    }
    if (loads.size === 0) pending.delete(id);
  }
  useStatusStore.getState().setSlow(slow);
  if (pending.size > 0) schedule();
}

function schedule(): void {
  timer ??= window.setTimeout(() => check(), CHECK_MS);
}

/** A layer's tile or image is asked for. */
export function loadStarted(id: string, load: Load): void {
  if (!pending.has(id)) pending.set(id, new Map());
  pending.get(id)!.set(load, Date.now());
  schedule();
}

/** It arrived, or failed. */
export function loadEnded(id: string, load: Load): void {
  pending.get(id)?.delete(load);
  check();
}

/** For tests: nothing waiting. */
export function clearLoads(): void {
  pending.clear();
  window.clearTimeout(timer);
  timer = undefined;
  useStatusStore.getState().setSlow([]);
}
