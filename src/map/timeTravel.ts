import type Map from 'ol/Map';
import ImageWMS from 'ol/source/ImageWMS';
import { config, defaultSublayers, overlayById, type Overlay } from '@/config/runtime';
import { createOverlayLayer, resolutionRange, showSublayers, type OverlayLayer } from '@/services/layers';
import { timeValues, valueAt, type TimeValues } from '@/services/time';
import { useMapStore } from '@/state/store';
import { attachCurtain } from './curtain';
import { resolutionToScale, scaleToResolution } from './projection';

/** Scale the view zooms to when the time view opens too far out for its layer to draw. */
const OPENING_SCALE = 20000;

/** Between the base map and the overlays; what was added later lies on the layer. */
const Z_INDEX = 5;
const ADDED_Z_INDEX = 6;
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
 * What was added after the date the view's layer shows (map.yaml: timeTravel.layers[].added): the
 * overlay, its years later than the year of that date and the sublayers they draw. None for a
 * layer without it; no years when the date is as late as the overlay's last.
 */
export function addedAfter(id: string | null, time: string | null): { def: Overlay; years: string[]; sublayers: string[] } | undefined {
  const shown = currentTimeLayer(id);
  const entry = config.map.timeTravel?.layers.find((l) => l.id === shown?.def.id);
  const def = entry?.added ? overlayById.get(entry.added) : undefined;
  const spec = def && timeValues(def);
  if (!shown || !def || !spec) return undefined;
  const after = (valueFor(shown.spec, time) ?? '').slice(0, 4);
  const years = after ? spec.values.filter((v) => v.slice(0, 4) > after) : [];
  return { def, years, sublayers: years.flatMap((v) => sublayersFor(def, spec, v)) };
}

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
  // What was added later, over the whole map: on the old photo where it will stand, on today's what it is.
  const addedIds = [...new Set((config.map.timeTravel?.layers ?? []).flatMap((l) => l.added ?? []))];
  const added = addedIds.flatMap((id) => {
    const def = overlayById.get(id);
    if (!def) return [];
    const layer = createOverlayLayer(def, { ratio: 1 });
    layer.setZIndex(ADDED_Z_INDEX);
    map.addLayer(layer);
    return [{ def, layer }];
  });

  /** The shown layer's scale range for the chosen value. */
  const rangeOf = (entry: (typeof shown)[number], value: string | undefined, named: string | null) =>
    resolutionRange(entry.def, sublayersFor(entry.def, entry.spec, value, named));

  const apply = () => {
    const s = useMapStore.getState();
    const open = s.tool === 'time';
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
    const later = open && s.timeAdded ? addedAfter(s.timeLayer, s.time) : undefined;
    for (const entry of added) {
      const names = later?.def.id === entry.def.id ? later.sublayers : [];
      entry.layer.setVisible(names.length > 0);
      if (names.length === 0) continue;
      showSublayers(entry.layer, names);
      const range = resolutionRange(entry.def, names);
      entry.layer.setMinResolution(range.min);
      entry.layer.setMaxResolution(range.max);
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
    if (
      s.tool !== prev.tool ||
      s.time !== prev.time ||
      s.timeLayer !== prev.timeLayer ||
      s.timeSublayers !== prev.timeSublayers ||
      s.timeAdded !== prev.timeAdded
    )
      apply();
    if (s.tool === 'time' && (prev.tool !== 'time' || s.timeLayer !== prev.timeLayer)) zoomIn();
    if (s.timeRetries !== prev.timeRetries) shown.forEach((e) => e.source?.refresh());
    if (s.timeStatus !== prev.timeStatus) fade();
  });

  return () => {
    unsubscribe();
    detachCurtain();
    for (const entry of [...shown, ...added]) {
      map.removeLayer(entry.layer);
      (entry.layer as OverlayLayer).dispose();
    }
  };
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
