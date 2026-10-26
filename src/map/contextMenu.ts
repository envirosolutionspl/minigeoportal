import type Map from 'ol/Map';
import { mapPressed, useMapMenu } from '@/state/mapMenu';
import { TAKES_CLICKS, useMapStore } from '@/state/store';

/** Holding a finger this long on the map opens the menu, as in map apps. */
export const LONG_PRESS_MS = 500;
/** A finger that moves this far is panning, not holding. */
const SLOP_PX = 10;
/** Android reports a long press as a context menu too, and the menu key sends one: one opening each. */
const SAME_OPENING_MS = 800;

/** The map's own buttons and the labels on it keep the browser's menu. */
const onMapButton = (e: Event) => (e.target as Element | null)?.closest?.('.ol-control, .ol-overlay-container') != null;

/**
 * The context menu of the map (ui/MapMenu.tsx): a right click, a long press on a touch screen,
 * or the menu key (or Shift+F10) on the focused map, which opens it at the centre. Not while a
 * tool (measuring, printing) uses the map's clicks.
 */
export function attachContextMenu(map: Map): () => void {
  const target = map.getTargetElement();
  let lastOpen = -Infinity;

  const open = (pixel: number[], byPress: boolean, byKeyboard = false) => {
    if (TAKES_CLICKS.has(useMapStore.getState().tool)) return;
    const coordinate = byKeyboard ? map.getView().getCenter() : map.getCoordinateFromPixel(pixel);
    if (!coordinate) return;
    lastOpen = performance.now();
    useMapMenu.getState().open({ pixel: [pixel[0], pixel[1]], coordinate: [coordinate[0], coordinate[1]], byKeyboard }, byPress);
  };

  const onContextMenu = (e: MouseEvent) => {
    if (onMapButton(e)) return;
    e.preventDefault();
    if (performance.now() - lastOpen < SAME_OPENING_MS) return;
    open(map.getEventPixel(e), false);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.target !== target || !(e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return;
    e.preventDefault();
    const size = map.getSize();
    if (size) open([size[0] / 2, size[1] / 2], false, true);
  };

  // Long press: one finger, held still.
  const fingers = new Set<number>();
  let timer: number | undefined;
  /** The finger being held: where it went down. */
  let start: { id: number; x: number; y: number } | null = null;
  const cancel = () => {
    window.clearTimeout(timer);
    start = null;
  };
  const onDown = (e: PointerEvent) => {
    mapPressed();
    if (e.pointerType === 'mouse') return;
    fingers.add(e.pointerId);
    if (fingers.size > 1 || onMapButton(e)) return cancel();
    start = { id: e.pointerId, x: e.clientX, y: e.clientY };
    const pixel = map.getEventPixel(e);
    timer = window.setTimeout(() => {
      start = null;
      // A light tick where the phone can (Android), as the base map wheel gives.
      navigator.vibrate?.(10);
      open(pixel, true);
    }, LONG_PRESS_MS);
  };
  // Only that finger counts: a mouse moving at the same time (a laptop with a touch screen) does not.
  const onMove = (e: PointerEvent) => {
    if (start?.id === e.pointerId && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP_PX) cancel();
  };
  const onUp = (e: PointerEvent) => {
    fingers.delete(e.pointerId);
    if (start?.id === e.pointerId) cancel();
  };

  // Moving the map takes the menu away: its place would no longer be under it.
  const close = () => useMapMenu.getState().at && useMapMenu.getState().close();

  target?.addEventListener('contextmenu', onContextMenu);
  target?.addEventListener('keydown', onKey);
  target?.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
  map.on('movestart', close);

  return () => {
    cancel();
    target?.removeEventListener('contextmenu', onContextMenu);
    target?.removeEventListener('keydown', onKey);
    target?.removeEventListener('pointerdown', onDown);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    map.un('movestart', close);
  };
}
