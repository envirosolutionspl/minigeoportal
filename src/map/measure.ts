import type Map from 'ol/Map';
import Draw from 'ol/interaction/Draw';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Overlay from 'ol/Overlay';
import type Feature from 'ol/Feature';
import { LineString, Polygon, type Geometry } from 'ol/geom';
import { getArea, getLength } from 'ol/sphere';
import { unByKey } from 'ol/Observable';
import type { EventsKey } from 'ol/events';
import { Circle, Fill, Stroke, Style } from 'ol/style';
import { formatArea, formatLength } from './format';
import { PROJECTION } from './projection';
import { t } from '@/i18n';
import { useMapStore } from '@/state/store';

const ACCENT = '#466946';

const STYLE = new Style({
  fill: new Fill({ color: 'rgba(70,105,70,0.15)' }),
  stroke: new Stroke({ color: ACCENT, width: 3, lineDash: [8, 6] }),
  image: new Circle({ radius: 5, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: ACCENT, width: 2 }) }),
});

/** Geodesic measurement on the ellipsoid, so results do not depend on the scale distortion of the map's projection. */
export function measure(geometry: Geometry): string | undefined {
  if (geometry instanceof Polygon) {
    const area = getArea(geometry, { projection: PROJECTION });
    const perimeter = getLength(new LineString(geometry.getLinearRing(0)!.getCoordinates()), { projection: PROJECTION });
    return `${formatArea(area)}, ${t('measure.perimeter', { length: formatLength(perimeter) })}`;
  }
  if (geometry instanceof LineString) return formatLength(getLength(geometry, { projection: PROJECTION }));
  return undefined;
}

function label(): { overlay: Overlay; element: HTMLElement } {
  const element = document.createElement('div');
  element.className = 'measure-label';
  return { overlay: new Overlay({ element, offset: [0, -12], positioning: 'bottom-center', stopEvent: false }), element };
}

/**
 * Length and area measurement with OpenLayers' draw interaction: click points, double click
 * (or click the first point of an area) to finish, Escape to cancel the shape being drawn.
 * Finished measurements stay on the map until cleared.
 */
export function attachMeasure(map: Map): () => void {
  const source = new VectorSource<Feature>();
  const layer = new VectorLayer({ source, style: STYLE, zIndex: 95 });
  map.addLayer(layer);
  const labels: Overlay[] = [];
  let draw: Draw | null = null;

  const stop = () => {
    if (draw) map.removeInteraction(draw);
    draw = null;
  };

  const start = (type: 'LineString' | 'Polygon') => {
    stop();
    draw = new Draw({ source, type, style: STYLE });
    let current: ReturnType<typeof label> | null = null;
    let listener: EventsKey | null = null;
    draw.on('drawstart', (e) => {
      current = label();
      map.addOverlay(current.overlay);
      labels.push(current.overlay);
      const geometry = e.feature.getGeometry()!;
      listener = geometry.on('change', () => {
        const text = measure(geometry);
        if (!current || !text) return;
        current.element.textContent = text;
        const at =
          geometry instanceof Polygon ? geometry.getInteriorPoint().getCoordinates() : (geometry as LineString).getLastCoordinate();
        current.overlay.setPosition(at);
      });
    });
    draw.on('drawend', (e) => {
      if (listener) unByKey(listener);
      const text = measure(e.feature.getGeometry()!);
      if (current) current.element.classList.add('measure-label-done');
      if (text) useMapStore.getState().setMeasureResult(text);
      current = null;
    });
    draw.on('drawabort', () => {
      const last = labels.pop();
      if (last) map.removeOverlay(last);
      current = null;
    });
    map.addInteraction(draw);
  };

  const clear = () => {
    source.clear();
    for (const o of labels.splice(0)) map.removeOverlay(o);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && draw) draw.abortDrawing();
  };
  window.addEventListener('keydown', onKey);

  const unsubscribe = useMapStore.subscribe((s, prev) => {
    if (s.tool !== prev.tool) {
      if (s.tool === 'measure-line') start('LineString');
      else if (s.tool === 'measure-area') start('Polygon');
      else stop();
    }
    if (s.measureClears !== prev.measureClears) clear();
  });

  return () => {
    unsubscribe();
    window.removeEventListener('keydown', onKey);
    stop();
    clear();
    map.removeLayer(layer);
  };
}
