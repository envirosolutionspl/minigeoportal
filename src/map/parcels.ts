import type Map from 'ol/Map';
import Feature from 'ol/Feature';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style, Text } from 'ol/style';
import Overlay from 'ol/Overlay';
import { unByKey } from 'ol/Observable';
import { createEmpty, extend, isEmpty, type Extent } from 'ol/extent';
import { parcelLookup } from '@/modules';
import { toggleParcelAt, useParcelStore } from '@/state/parcels';
import { useMapStore } from '@/state/store';
import { SELECTION, translucent } from './style';
import { formatArea, formatLength } from './format';
import { perimeterOf, sideLabels } from './sides';
import { t } from '@/i18n';

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
 * The parcel selection on the map: the outlines of its parcels numbered as in the list, a tip
 * with the number and area of the one under the mouse, and, while its tool is open, a click (or
 * Enter on the focused map, at its centre) that adds the parcel there or takes a selected one
 * away. The parcels stay on the map when the tool closes.
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
      const style = styleFor(i + 1);
      feature.setStyle((f, resolution) => [...style, ...sideLabels(f as Feature, resolution)]);
      const { number, region } = entry.parcel;
      const perimeter = t('measure.perimeter', { length: formatLength(perimeterOf(entry.geometry)) });
      feature.set('tip', `${i + 1}. ${t('parcels.row', { number, region, area: formatArea(entry.area) })}, ${perimeter}`);
      source.addFeature(feature);
    });
  };
  draw();

  // A mouse over a parcel shows its number and area; a finger has no hover, the list says the same.
  const tip = document.createElement('div');
  tip.className = 'measure-label';
  const hover = new Overlay({ element: tip, offset: [14, -10], positioning: 'bottom-left', stopEvent: false });
  map.addOverlay(hover);
  const hide = () => hover.setPosition(undefined);
  const move = map.on('pointermove', (e) => {
    const mouse = (e.originalEvent as PointerEvent).pointerType === 'mouse';
    const feature = mouse && !e.dragging ? map.forEachFeatureAtPixel(e.pixel, (f) => f, { layerFilter: (l) => l === layer }) : undefined;
    const text = feature?.get('tip') as string | undefined;
    if (!text) return hide();
    tip.textContent = text;
    hover.setPosition(e.coordinate);
  });
  map.getViewport()?.addEventListener('mouseleave', hide);

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
    unByKey(move);
    map.getViewport()?.removeEventListener('mouseleave', hide);
    map.removeOverlay(hover);
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
