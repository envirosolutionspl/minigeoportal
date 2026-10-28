import type Map from 'ol/Map';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import WKT from 'ol/format/WKT';
import { Circle, Fill, Stroke, Style } from 'ol/style';
import { scaleToResolution } from './projection';
import { duration } from './motion';
import { useMapStore, type FocusTarget } from '@/state/store';

import { HIGHLIGHT, translucent } from './style';

const ORANGE = HIGHLIGHT;
const SHOW_MS = 3500;
const FADE_MS = 900;

/** White halo under an orange line, readable on photos and on maps. */
const STYLE = [
  new Style({
    stroke: new Stroke({ color: 'rgba(255,255,255,0.95)', width: 7 }),
    image: new Circle({ radius: 11, fill: new Fill({ color: 'rgba(255,255,255,0.95)' }) }),
  }),
  new Style({
    stroke: new Stroke({ color: ORANGE, width: 3.5 }),
    fill: new Fill({ color: translucent(ORANGE, 0.14) }),
    image: new Circle({ radius: 8, fill: new Fill({ color: ORANGE }) }),
  }),
];

const wkt = new WKT();

/**
 * Zooms to a searched object and outlines it, as public geoportals do: for a few seconds,
 * or until cleared for parcels and buildings.
 */
export function attachFocus(map: Map): () => void {
  const source = new VectorSource<Feature>();
  const layer = new VectorLayer({ source, style: STYLE, zIndex: 90 });
  map.addLayer(layer);
  const view = map.getView();
  let timer: number | undefined;
  let frame: number | undefined;

  const stop = () => {
    window.clearTimeout(timer);
    if (frame !== undefined) window.cancelAnimationFrame(frame);
  };

  const fadeOut = () => {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / FADE_MS);
      layer.setOpacity(1 - t);
      if (t < 1) frame = window.requestAnimationFrame(step);
      else source.clear();
    };
    frame = window.requestAnimationFrame(step);
  };

  const show = (target: FocusTarget) => {
    // Showing an area or a scale keeps the current outline, e.g. a found parcel.
    if (target.extent) {
      view.fit(target.extent, { padding: target.padding ?? [24, 24, 24, 24], duration: duration(700) });
      return;
    }
    if (target.scale) {
      view.animate({ resolution: scaleToResolution(target.scale), duration: duration(500) });
      return;
    }
    stop();
    source.clear();
    layer.setOpacity(1);
    const geometry = target.wkt ? wkt.readGeometry(target.wkt) : target.center ? new Point(target.center) : null;
    if (!geometry) return;
    source.addFeature(new Feature(geometry));
    if (geometry instanceof Point) {
      view.animate({ center: geometry.getCoordinates(), zoom: target.zoom, duration: duration(600) });
    } else {
      view.fit(geometry.getExtent(), { padding: [96, 64, 96, 64], maxZoom: target.zoom, duration: duration(700) });
    }
    if (!target.persist) timer = window.setTimeout(fadeOut, SHOW_MS);
  };

  const unsubscribe = useMapStore.subscribe((s, prev) => {
    if (s.focus === prev.focus) return;
    if (s.focus) show(s.focus);
    else {
      stop();
      source.clear();
    }
  });

  return () => {
    stop();
    unsubscribe();
    map.removeLayer(layer);
  };
}
