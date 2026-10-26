import type Map from 'ol/Map';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Circle, Fill, Stroke, Style } from 'ol/style';
import { resolutionToScale } from './projection';
import { HIGHLIGHT } from './style';
import { selectedSublayers, type Overlay } from '@/config/runtime';
import type { OverlayLayer } from '@/services/layers';
import { fetchFeatureInfo, queryLayers } from '@/services/featureinfo';
import { useInfoStore } from '@/state/info';
import { useMapStore } from '@/state/store';
import { consumeMapClick } from '@/state/mapMenu';

const MARKER = new Style({
  image: new Circle({ radius: 7, fill: new Fill({ color: HIGHLIGHT }), stroke: new Stroke({ color: '#ffffff', width: 2.5 }) }),
});

interface Shown {
  def: Overlay;
  layer: OverlayLayer;
}

/** The overlays that are on and answer at this scale, each with the layers to ask it about. */
export function infoTargets(shown: Shown[], scale: number): (Shown & { layers: string[] })[] {
  const s = useMapStore.getState();
  return shown
    .filter(({ def }) => s.overlays.includes(def.id))
    .map((o) => ({ ...o, layers: queryLayers(o.def, selectedSublayers(o.def, s.sublayers), scale) }))
    .filter((t) => t.layers.length > 0);
}

/**
 * Map click queries every active overlay at that point and marks the spot. With the keyboard,
 * Enter on the focused map asks about the map centre (marked by a crosshair while focused).
 * A place where no layer answered is asked about again once the map reaches a scale where one does.
 */
export function attachFeatureInfo(map: Map, overlays: () => Shown[]): () => void {
  const marker = new Feature<Point>();
  marker.setStyle(MARKER);
  const markerLayer = new VectorLayer({ source: new VectorSource<Feature<Point>>(), zIndex: 100 });
  map.addLayer(markerLayer);
  let controller: AbortController | null = null;

  const showMarker = (coordinate: number[] | null) => {
    const source = markerLayer.getSource()!;
    source.clear();
    if (coordinate) {
      marker.setGeometry(new Point(coordinate));
      source.addFeature(marker);
    }
  };

  const onClick = (evt: { coordinate: number[] }) => {
    if (useMapStore.getState().tool !== 'none') return;
    const view = map.getView();
    const resolution = view.getResolution();
    if (resolution === undefined) return;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    const s = useMapStore.getState();
    const targets = infoTargets(overlays(), resolutionToScale(resolution));

    const coordinate: [number, number] = [evt.coordinate[0], evt.coordinate[1]];
    const info = useInfoStore.getState();
    info.start(
      coordinate,
      targets.map((t) => t.def.id),
    );
    showMarker(coordinate);
    // On a phone, upright or sideways, the place panel takes the layer list's room.
    if (s.panel === 'catalog' && window.matchMedia?.('(max-width: 639px), (max-height: 500px)').matches) s.setPanel('none');

    for (const t of targets) {
      fetchFeatureInfo(t.def, t.layer, coordinate, resolution, t.layers, signal)
        .then((records) => info.resolve(coordinate, t.def.id, { status: 'done', records }))
        .catch(() => {
          if (!signal.aborted) info.resolve(coordinate, t.def.id, { status: 'error' });
        });
    }
  };

  // A click while the context menu is open, or the end of the press that opened it, only closes it.
  const onSingleClick = (evt: { coordinate: number[] }) => !consumeMapClick() && onClick(evt);
  map.on('singleclick', onSingleClick);
  // The panel offered to zoom to where a layer answers: once there, the same place is asked about.
  const onMoveEnd = () => {
    const query = useInfoStore.getState().query;
    const resolution = map.getView().getResolution();
    if (!query || query.services.length > 0 || resolution === undefined || useMapStore.getState().tool !== 'none') return;
    if (infoTargets(overlays(), resolutionToScale(resolution)).length > 0) onClick({ coordinate: query.coordinate });
  };
  map.on('moveend', onMoveEnd);
  const target = map.getTargetElement();
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.target !== target) return;
    e.preventDefault();
    const view = map.getView();
    // After a keyboard pan the map is still moving: ask about where it stops.
    const ask = () => {
      const center = view.getCenter();
      if (center) onClick({ coordinate: center });
    };
    if (view.getAnimating()) map.once('moveend', ask);
    else ask();
  };
  target?.addEventListener('keydown', onKey);
  const unsubscribe = useInfoStore.subscribe((s) => {
    if (!s.query) {
      controller?.abort();
      showMarker(null);
    }
  });

  return () => {
    map.un('singleclick', onSingleClick);
    map.un('moveend', onMoveEnd);
    target?.removeEventListener('keydown', onKey);
    unsubscribe();
    controller?.abort();
    map.removeLayer(markerLayer);
  };
}
