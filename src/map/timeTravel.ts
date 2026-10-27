import type Map from 'ol/Map';
import ImageWMS from 'ol/source/ImageWMS';
import { config, defaultSublayers, overlayById, type Overlay } from '@/config/runtime';
import { createOverlayLayer, resolutionRange, showSublayers, type OverlayLayer } from '@/services/layers';
import { timeValues, valueAt, type TimeValues } from '@/services/time';
import { timeShown, useMapStore } from '@/state/store';
import { attachCurtain } from './curtain';
import { resolutionToScale, scaleToResolution } from './projection';
import { dateText } from './format';
import { t } from '@/i18n';

/** Scale the view zooms to when the time view opens too far out for its layer to draw. */
const OPENING_SCALE = 20000;

/** Between the base map and the overlays. */
const Z_INDEX = 5;
/** The last date's image stays while the next loads, faded so the wait shows on the map too. */
const LOADING_OPACITY = 0.5;

/** The layers of the time view (map.yaml: timeTravel.layers) that have a time block, in order. */
export function timeLayers(): { def: Overlay; spec: TimeValues }[] {
  return (config.map.timeTravel?.layers ?? []).flatMap((entry) => {
    const def = overlayById.get(entry.id);
    const spec = def && timeValues(def);
    return def && spec ? [{ def, spec }] : [];
  });
}

/** The layer the view shows: the chosen one, else the first. */
export function currentTimeLayer(id: string | null): { def: Overlay; spec: TimeValues } | undefined {
  const layers = timeLayers();
  return layers.find((l) => l.def.id === id) ?? layers[0];
}

/**
 * The sublayers a layer draws for a value: the ones a module named for the date (the sheets of
 * the old maps at the place), else an edition's own, else the layer's defaults.
 */
export function sublayersFor(def: Overlay, spec: TimeValues, value: string | undefined, named: string | null = null): string[] {
  const edition = value !== undefined ? spec.editions?.[value] : undefined;
  const list = named ?? edition?.layer;
  return list ? list.split(',').map((n) => n.trim()) : defaultSublayers(def);
}

/** The value a layer draws for the date chosen on the bar: the latest of its own not after it. */
const valueFor = (spec: TimeValues, time: string | null) => (time === null ? spec.current : (valueAt(spec.values, time) ?? spec.current));

/**
 * The time view (map.yaml: timeTravel): its layers, one drawn over the base map while the view is
 * open, at the date chosen on the time bar (ui/TimeBar.tsx). A layer with a time dimension is a
 * WMS asked for one image per view and date; a series draws the sublayers of its edition.
 * OpenLayers keeps the last image on screen until the new one arrives, and the bar says what is
 * loading. Compared with the present, the layer is drawn left of a curtain (curtain.ts) and the
 * base map shows right of it.
 */
export function attachTimeTravel(map: Map): () => void {
  const layers = timeLayers();
  if (layers.length === 0) return () => {};
  const { setTimeStatus } = useMapStore.getState();

  const shown = layers.map(({ def, spec }) => {
    // The image is the size of the view, not larger: the services are slow, and a pan asks anyway.
    const layer = createOverlayLayer(def, { ratio: 1 });
    layer.setZIndex(Z_INDEX);
    map.addLayer(layer);
    const source = layer.getSource();
    if (source instanceof ImageWMS) {
      source.on('imageloadstart', () => setTimeStatus('loading'));
      source.on('imageloadend', () => setTimeStatus('idle'));
      source.on('imageloaderror', () => setTimeStatus('error'));
    }
    return { def, spec, layer, source };
  });
  const detachCurtain = attachCurtain(
    map,
    shown.map((s) => s.layer),
  );

  /** The shown layer's scale range for the chosen value. */
  const rangeOf = (entry: (typeof shown)[number], value: string | undefined, named: string | null) =>
    resolutionRange(entry.def, sublayersFor(entry.def, entry.spec, value, named));

  const apply = () => {
    const s = useMapStore.getState();
    const open = timeShown(s);
    const current = currentTimeLayer(s.timeLayer)?.def.id;
    for (const entry of shown) {
      const visible = open && entry.def.id === current;
      entry.layer.setVisible(visible);
      if (!visible) continue;
      const value = valueFor(entry.spec, s.time);
      const names = sublayersFor(entry.def, entry.spec, value, s.timeSublayers);
      showSublayers(entry.layer, names);
      const range = rangeOf(entry, value, s.timeSublayers);
      entry.layer.setMinResolution(range.min);
      entry.layer.setMaxResolution(range.max);
      if (
        entry.spec.param &&
        entry.source instanceof ImageWMS &&
        value !== undefined &&
        entry.source.getParams()[entry.spec.param] !== value
      ) {
        entry.source.updateParams({ [entry.spec.param]: value });
      }
    }
  };
  apply();

  const fade = () => {
    const opacity = useMapStore.getState().timeStatus === 'loading' ? LOADING_OPACITY : 1;
    for (const entry of shown) entry.layer.setOpacity(opacity);
  };

  /** Opened too far out for the layer to draw: closer, at the scale where it does. */
  const zoomIn = () => {
    const s = useMapStore.getState();
    const entry = shown.find((e) => e.def.id === currentTimeLayer(s.timeLayer)?.def.id);
    const resolution = map.getView().getResolution();
    if (!entry || resolution === undefined) return;
    const range = rangeOf(entry, valueFor(entry.spec, s.time), s.timeSublayers);
    if (resolution > range.max) s.zoomToScale(Math.min(OPENING_SCALE, resolutionToScale(range.max)));
  };
  if (useMapStore.getState().tool === 'time') zoomIn();

  const unsubscribe = useMapStore.subscribe((s, prev) => {
    if (s.tool !== prev.tool || s.time !== prev.time || s.timeLayer !== prev.timeLayer || s.timeSublayers !== prev.timeSublayers) apply();
    if (s.tool === 'time' && (prev.tool !== 'time' || s.timeLayer !== prev.timeLayer)) zoomIn();
    if (s.timeRetries !== prev.timeRetries) shown.forEach((e) => e.source?.refresh());
    if (s.timeStatus !== prev.timeStatus) fade();
  });

  return () => {
    unsubscribe();
    detachCurtain();
    for (const entry of shown) {
      map.removeLayer(entry.layer);
      (entry.layer as OverlayLayer).dispose();
    }
  };
}

/** What a print says of the time view's layer: its name and date, or the name of its edition. */
export function timeCaption(id: string | null, time: string | null): string | null {
  const entry = currentTimeLayer(id);
  if (!entry || time === null) return null;
  const edition = entry.spec.editions?.[time]?.label;
  return edition
    ? t('print.timeEdition', { title: entry.def.title, edition })
    : t('print.time', { title: entry.def.title, date: dateText(time) });
}

/** Whether the view's layer draws anything at this scale, whatever the date (its widest sublayer). */
export function timeLayerReaches(id: string | null, scale: number): boolean {
  const entry = currentTimeLayer(id);
  if (!entry) return false;
  const range = resolutionRange(
    entry.def,
    entry.def.sublayers.map((l) => l.name),
  );
  const resolution = scaleToResolution(scale);
  return resolution >= range.min && resolution <= range.max;
}

/** Whether the view's layer draws at this scale for this date (its service's limits). */
export function timeLayerDrawsAt(id: string | null, time: string | null, named: string | null, scale: number): boolean {
  const entry = currentTimeLayer(id);
  if (!entry) return false;
  const range = resolutionRange(entry.def, sublayersFor(entry.def, entry.spec, valueFor(entry.spec, time), named));
  const resolution = scaleToResolution(scale);
  return resolution >= range.min && resolution <= range.max;
}
