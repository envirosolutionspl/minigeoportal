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
import { MEASURE, translucent } from './style';
import { t } from '@/i18n';
import { useMapStore } from '@/state/store';

const ACCENT = MEASURE;

const STYLE = new Style({
  fill: new Fill({ color: translucent(MEASURE, 0.15) }),
  stroke: new Stroke({ color: ACCENT, width: 3, lineDash: [8, 6] }),
  image: new Circle({ radius: 5, fill: new Fill({ color: '#ffffff' }), stroke: new Stroke({ color: ACCENT, width: 2 }) }),
});

/** Measurement on the sphere (OpenLayers' sphere), so results do not depend on the scale distortion of the map's projection. */
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

/** Drawn shapes with their labels: the measurements, or the line of the terrain profile. */
interface Drawings {
  source: VectorSource<Feature>;
  layer: VectorLayer<VectorSource<Feature>>;
  labels: Overlay[];
}

/**
 * Length and area measurement with OpenLayers' draw interaction: click points, double click
 * (or click the first point of an area) to finish, Escape to cancel the shape being drawn.
 * Finished measurements stay on the map until cleared. The terrain profile tool draws its line
 * the same way, apart from the measurements: one line at a time, gone when the tool closes.
 */
export function attachMeasure(map: Map): () => void {
  const drawings = (): Drawings => {
    const source = new VectorSource<Feature>();
    const layer = new VectorLayer({ source, style: STYLE, zIndex: 95 });
    map.addLayer(layer);
    return { source, layer, labels: [] };
  };
  const measurements = drawings();
  const profile = drawings();
  let draw: Draw | null = null;

  const stop = () => {
    if (draw) map.removeInteraction(draw);
    draw = null;
  };

  const clear = ({ source, labels }: Drawings) => {
    source.clear();
    for (const o of labels.splice(0)) map.removeOverlay(o);
  };

  const start = (type: 'LineString' | 'Polygon', target: Drawings) => {
    stop();
    const { source, labels } = target;
    draw = new Draw({ source, type, style: STYLE });
    let current: ReturnType<typeof label> | null = null;
    let listener: EventsKey | null = null;
    draw.on('drawstart', (e) => {
      // The profile follows one line: a new one replaces it.
      if (target === profile) clear(profile);
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
      const geometry = e.feature.getGeometry()!;
      if (current) current.element.classList.add('measure-label-done');
      if (target === profile) useMapStore.getState().setProfileLine((geometry as LineString).getCoordinates() as [number, number][]);
      else {
        const text = measure(geometry);
        if (text) useMapStore.getState().setMeasureResult(text);
      }
      current = null;
    });
    draw.on('drawabort', () => {
      const last = labels.pop();
      if (last) map.removeOverlay(last);
      current = null;
    });
    map.addInteraction(draw);
  };

  /** Where the last Enter put a point: a second Enter at the same place finishes the shape. */
  let lastKeyPoint: number[] | undefined;
  const onKey = (e: KeyboardEvent) => {
    if (!draw) return;
    if (e.key === 'Escape') {
      draw.abortDrawing();
      lastKeyPoint = undefined;
    }
    // With the keyboard (WCAG 2.1.1): Enter on the focused map adds the point at its centre, as
    // a click does; Enter again without moving the map ends the measurement, as a double click.
    if (e.key === 'Enter' && e.target === map.getTargetElement()) {
      const centre = map.getView().getCenter();
      if (!centre) return;
      e.preventDefault();
      if (lastKeyPoint && lastKeyPoint[0] === centre[0] && lastKeyPoint[1] === centre[1]) {
        draw.finishDrawing();
        lastKeyPoint = undefined;
      } else {
        draw.appendCoordinates([centre]);
        lastKeyPoint = centre;
      }
    }
  };
  window.addEventListener('keydown', onKey);

  const unsubscribe = useMapStore.subscribe((s, prev) => {
    if (s.tool !== prev.tool) {
      if (prev.tool === 'profile') {
        clear(profile);
        s.setProfileLine(null);
      }
      if (s.tool === 'measure-line') start('LineString', measurements);
      else if (s.tool === 'measure-area') start('Polygon', measurements);
      else if (s.tool === 'profile') start('LineString', profile);
      else stop();
      // The focus goes to the map, so Enter adds the first point there at once, as the hint says,
      // and does not press the tool's button again.
      if (draw) map.getTargetElement()?.focus({ preventScroll: true });
    }
    if (s.measureClears !== prev.measureClears) clear(measurements);
  });

  return () => {
    unsubscribe();
    window.removeEventListener('keydown', onKey);
    stop();
    for (const d of [measurements, profile]) {
      clear(d);
      map.removeLayer(d.layer);
    }
  };
}
