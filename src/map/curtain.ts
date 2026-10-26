import type Map from 'ol/Map';
import type Layer from 'ol/layer/Layer';
import type RenderEvent from 'ol/render/Event';
import { getRenderPixel } from 'ol/render';
import { t } from '@/i18n';
import { dateText } from './format';
import { swallowMapClick } from '@/state/mapMenu';
import { useMapStore } from '@/state/store';

/** Arrow keys move the curtain by this much of the map's width. */
const KEY_STEP = 0.05;

/**
 * The curtain of the time view's comparison: the time layer is drawn left of a line across the
 * map, the base map (the present) shows right of it. The line has a handle to drag with a mouse
 * or a finger; a click anywhere at the handle's height moves the line there, and the arrow keys
 * move it from the keyboard (WCAG 2.5.7: nothing needs dragging). The handle sits over the map
 * like the print frame, so the map pans under it at no cost.
 */
export function attachCurtain(map: Map, layer: Layer): () => void {
  const viewport = map.getViewport();
  if (!viewport) return () => {};
  const clip = (e: RenderEvent) => {
    const s = useMapStore.getState();
    if (!s.compare || s.tool !== 'time') return;
    const ctx = e.context as CanvasRenderingContext2D;
    const [width, height] = map.getSize() ?? [0, 0];
    const x = width * s.curtain;
    const tl = getRenderPixel(e, [0, 0]);
    const tr = getRenderPixel(e, [x, 0]);
    const bl = getRenderPixel(e, [0, height]);
    const br = getRenderPixel(e, [x, height]);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tl[0], tl[1]);
    ctx.lineTo(tr[0], tr[1]);
    ctx.lineTo(br[0], br[1]);
    ctx.lineTo(bl[0], bl[1]);
    ctx.closePath();
    ctx.clip();
  };
  const unclip = (e: RenderEvent) => {
    const s = useMapStore.getState();
    if (s.compare && s.tool === 'time') (e.context as CanvasRenderingContext2D).restore();
  };
  layer.on('prerender', clip);
  layer.on('postrender', unclip);

  // The line, its handle, the labels of both sides and the track a click moves the line on.
  const root = document.createElement('div');
  root.className = 'curtain';
  root.hidden = true;
  root.innerHTML =
    '<div class="curtain-track"></div><div class="curtain-line"><span class="curtain-label curtain-label-left"></span>' +
    `<div class="curtain-handle" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-label="${t('time.curtain')}" title="${t('time.curtainHint')}">` +
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 7-5 5 5 5"/><path d="m15 7 5 5-5 5"/></svg>' +
    `</div><span class="curtain-label curtain-label-right">${t('time.now')}</span></div>`;
  viewport.insertBefore(root, map.getOverlayContainer() ?? null);
  const line = root.querySelector<HTMLElement>('.curtain-line')!;
  const handle = root.querySelector<HTMLElement>('.curtain-handle')!;
  const left = root.querySelector<HTMLElement>('.curtain-label-left')!;
  const track = root.querySelector<HTMLElement>('.curtain-track')!;

  const place = () => {
    const s = useMapStore.getState();
    root.hidden = !(s.compare && s.tool === 'time');
    line.style.left = `${(s.curtain * 100).toFixed(2)}%`;
    handle.setAttribute('aria-valuenow', String(Math.round(s.curtain * 100)));
    const date = s.time ? dateText(s.time) : '';
    if (left.textContent !== date) left.textContent = date;
  };
  place();

  const fractionAt = (clientX: number) => {
    const rect = viewport.getBoundingClientRect();
    return rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
  };
  const setCurtain = (fraction: number) => {
    useMapStore.getState().setCurtain(fraction);
    map.render();
  };

  // Dragging the handle: the map does not pan meanwhile.
  let dragging = false;
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    handle.focus();
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    e.stopPropagation();
    setCurtain(fractionAt(e.clientX));
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    e.stopPropagation();
    dragging = false;
  };
  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
  // The press and the release still reach the map (the track is in its viewport), so a drag
  // across the track pans the map; a click is the curtain's, not the map's.
  const onTrackClick = (e: MouseEvent) => {
    swallowMapClick();
    setCurtain(fractionAt(e.clientX));
    // The arrow keys then move the line on from here.
    handle.focus();
  };
  track.addEventListener('click', onTrackClick);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -KEY_STEP : e.key === 'ArrowRight' ? KEY_STEP : e.key === 'Home' ? -1 : e.key === 'End' ? 1 : 0;
    if (step === 0) return;
    e.preventDefault();
    e.stopPropagation();
    setCurtain(useMapStore.getState().curtain + step);
  };
  handle.addEventListener('keydown', onKey);

  const unsubscribe = useMapStore.subscribe((s, prev) => {
    if (s.compare !== prev.compare || s.tool !== prev.tool || s.curtain !== prev.curtain || s.time !== prev.time) {
      place();
      if (s.compare !== prev.compare || s.tool !== prev.tool) map.render();
    }
  });

  return () => {
    unsubscribe();
    layer.un('prerender', clip);
    layer.un('postrender', unclip);
    root.remove();
  };
}
