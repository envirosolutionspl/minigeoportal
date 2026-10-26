import type Map from 'ol/Map';
import ImageWMS from 'ol/source/ImageWMS';
import { config, defaultSublayers, overlayById } from '@/config/runtime';
import { createOverlayLayer, resolutionRange, showSublayers } from '@/services/layers';
import { timeValues } from '@/services/time';
import { useMapStore } from '@/state/store';
import { attachCurtain } from './curtain';
import { resolutionToScale, scaleToResolution } from './projection';

/** Scale the view zooms to when the time view opens too far out for its layer to draw. */
const OPENING_SCALE = 20000;

/** Between the base map and the overlays. */
const Z_INDEX = 5;

/**
 * The time view (map.yaml: timeTravel): its layer, drawn over the base map while the view is
 * open, at the date chosen on the time bar (ui/TimeBar.tsx). The layer is a WMS with a time
 * dimension: one image per view, asked again for each date; OpenLayers keeps the last image on
 * screen until the new one arrives, and the bar says what is loading. Compared with the
 * present, the layer is drawn left of a curtain (curtain.ts) and the base map shows right of it.
 */
export function attachTimeTravel(map: Map): () => void {
  const def = config.map.timeTravel && overlayById.get(config.map.timeTravel.layer);
  const spec = def && timeValues(def);
  if (!def || !spec) return () => {};

  const layer = createOverlayLayer(def);
  layer.setZIndex(Z_INDEX);
  const names = defaultSublayers(def);
  showSublayers(layer, names);
  const range = resolutionRange(def, names);
  layer.setMinResolution(range.min);
  layer.setMaxResolution(range.max);
  map.addLayer(layer);
  const detachCurtain = attachCurtain(map, layer);

  const source = layer.getSource();
  const { setTimeStatus } = useMapStore.getState();
  if (source instanceof ImageWMS) {
    source.on('imageloadstart', () => setTimeStatus('loading'));
    source.on('imageloadend', () => setTimeStatus('idle'));
    source.on('imageloaderror', () => setTimeStatus('error'));
  }

  const apply = () => {
    const s = useMapStore.getState();
    const open = s.tool === 'time';
    layer.setVisible(open);
    if (!open || !spec.param || !(source instanceof ImageWMS)) return;
    const value = s.time ?? spec.current;
    if (source.getParams()[spec.param] !== value) source.updateParams({ [spec.param]: value });
  };
  apply();

  /** Opened too far out for the layer to draw: closer, at the scale where it does. */
  const zoomIn = () => {
    const resolution = map.getView().getResolution();
    if (resolution !== undefined && resolution > range.max)
      useMapStore.getState().zoomToScale(Math.min(OPENING_SCALE, resolutionToScale(range.max)));
  };
  if (useMapStore.getState().tool === 'time') zoomIn();

  const unsubscribe = useMapStore.subscribe((s, prev) => {
    if (s.tool !== prev.tool || s.time !== prev.time) apply();
    if (s.tool === 'time' && prev.tool !== 'time') zoomIn();
    if (s.timeRetries !== prev.timeRetries) source?.refresh();
  });

  return () => {
    unsubscribe();
    detachCurtain();
    map.removeLayer(layer);
    layer.dispose();
  };
}

/** Whether the time layer draws at this scale (its service's limits). */
export function timeLayerDrawsAt(scale: number): boolean {
  const def = config.map.timeTravel && overlayById.get(config.map.timeTravel.layer);
  if (!def) return false;
  const range = resolutionRange(def, defaultSublayers(def));
  const resolution = scaleToResolution(scale);
  return resolution >= range.min && resolution <= range.max;
}
