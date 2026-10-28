import type Map from 'ol/Map';
import Feature from 'ol/Feature';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style, Text } from 'ol/style';
import { unByKey } from 'ol/Observable';
import { createEmpty, extend, isEmpty, type Extent } from 'ol/extent';
import { parcelLookup } from '@/modules';
import { toggleParcelAt, useParcelStore } from '@/state/parcels';
import { useMapStore } from '@/state/store';
import { SELECTION, translucent } from './style';

/** A light halo under the outline keeps it visible on photos and on the map alike (WCAG 1.4.11). */
const HALO = new Style({ stroke: new Stroke({ color: 'rgba(255,255,255,0.9)', width: 6 }) });

/** The outline, a faint fill and the parcel's place in the list, so the map and the list match without colour. */
const styleFor = (n: number) => [
  HALO,
  new Style({
    stroke: new Stroke({ color: SELECTION, width: 3 }),
    fill: new Fill({ color: translucent(SELECTION, 0.15) }),
    text: new Text({
      text: String(n),
      font: 'bold 16px system-ui, sans-serif',
      fill: new Fill({ color: '#ffffff' }),
      stroke: new Stroke({ color: SELECTION, width: 4 }),
      overflow: true,
    }),
  }),
];

/**
 * The parcel selection on the map: the outlines of its parcels numbered as in the list, and,
 * while its tool is open, a click (or Enter on the focused map, at its centre) that adds the
 * parcel there or takes a selected one away. The parcels stay on the map when the tool closes.
 */
export function attachParcels(map: Map): () => void {
  if (!parcelLookup) return () => {};
  const source = new VectorSource<Feature>();
  const layer = new VectorLayer({ source, zIndex: 90 });
  map.addLayer(layer);

  const draw = () => {
    const { entries } = useParcelStore.getState();
    source.clear();
    useMapStore.getState().parcels.forEach((id, i) => {
      const entry = entries[id];
      if (entry?.status !== 'ready') return;
      const feature = new Feature(entry.geometry);
      feature.setStyle(styleFor(i + 1));
      source.addFeature(feature);
    });
  };
  draw();

  const open = () => useMapStore.getState().tool === 'parcels';
  const click = map.on('singleclick', (e) => {
    if (open()) void toggleParcelAt(e.coordinate as [number, number]);
  });
  // With the keyboard (WCAG 2.1.1): Enter on the focused map takes the parcel at its centre.
  const onKey = (e: KeyboardEvent) => {
    if (!open() || e.key !== 'Enter' || e.target !== map.getTargetElement()) return;
    const centre = map.getView().getCenter();
    if (!centre) return;
    e.preventDefault();
    void toggleParcelAt(centre as [number, number]);
  };
  window.addEventListener('keydown', onKey);

  const unsubscribeMap = useMapStore.subscribe((s, prev) => {
    if (s.parcels !== prev.parcels) draw();
    // As with measuring: the focus goes to the map, so Enter works there at once.
    if (s.tool === 'parcels' && prev.tool !== 'parcels') map.getTargetElement()?.focus({ preventScroll: true });
  });
  const unsubscribeParcels = useParcelStore.subscribe((s, prev) => {
    if (s.entries !== prev.entries) draw();
  });

  return () => {
    unsubscribeMap();
    unsubscribeParcels();
    unByKey(click);
    window.removeEventListener('keydown', onKey);
    map.removeLayer(layer);
  };
}

/** The extent of the selected parcels found so far, to show them all. */
export function parcelsExtent(): Extent | undefined {
  const { entries } = useParcelStore.getState();
  const extent = createEmpty();
  for (const id of useMapStore.getState().parcels) {
    const entry = entries[id];
    if (entry?.status === 'ready') extend(extent, entry.geometry.getExtent());
  }
  return isEmpty(extent) ? undefined : extent;
}
