import type Map from 'ol/Map';
import type ImageLayer from 'ol/layer/Image';
import type ImageWMS from 'ol/source/ImageWMS';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Circle, Fill, Stroke, Style } from 'ol/style';
import { OGC_PIXEL } from './projection';
import { selectedSublayers, type Overlay } from '@/services/registry';
import { fetchFeatureInfo, queryLayers } from '@/services/featureinfo';
import { useInfoStore } from '@/state/info';
import { useMapStore } from '@/state/store';

const MARKER = new Style({
  image: new Circle({ radius: 7, fill: new Fill({ color: '#FF8142' }), stroke: new Stroke({ color: '#ffffff', width: 2.5 }) }),
});

/** Map click queries every active overlay at that point and marks the spot. */
export function attachFeatureInfo(map: Map, overlays: { def: Overlay; layer: ImageLayer<ImageWMS> }[]): () => void {
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
    const scale = resolution / OGC_PIXEL;
    const targets = overlays
      .filter(({ def }) => s.overlays.includes(def.id))
      .map((o) => ({ ...o, layers: queryLayers(o.def, selectedSublayers(o.def, s.sublayers), scale) }))
      .filter((t) => t.layers.length > 0);

    const coordinate: [number, number] = [evt.coordinate[0], evt.coordinate[1]];
    const info = useInfoStore.getState();
    info.start(coordinate, targets.map((t) => t.def.id));
    showMarker(coordinate);
    if (s.panel === 'catalog' && window.innerWidth < 640) s.setPanel('none');

    for (const t of targets) {
      fetchFeatureInfo(t.def, t.layer.getSource()!, coordinate, resolution, t.layers, signal)
        .then((records) => info.resolve(coordinate, t.def.id, { status: 'done', records }))
        .catch((e: unknown) => {
          if (signal.aborted) return;
          info.resolve(coordinate, t.def.id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
        });
    }
  };

  map.on('singleclick', onClick);
  const unsubscribe = useInfoStore.subscribe((s) => {
    if (!s.query) {
      controller?.abort();
      showMarker(null);
    }
  });

  return () => {
    map.un('singleclick', onClick);
    unsubscribe();
    controller?.abort();
  };
}
