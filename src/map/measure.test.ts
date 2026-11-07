import { describe, expect, it } from 'vitest';
import { LineString, Point, Polygon } from 'ol/geom';
import { fromLonLat } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import { attachMeasure, measure } from './measure';
import { formatLength } from './format';
import { perimeterOf } from './sides';
import { useMapStore } from '@/state/store';
import { testMap } from '@/test/helpers';

const plain = (s?: string) => s?.replace(/\s/g, ' ');

/**
 * A length along the national grid at an easting, on the ground: over the scale of PL-1992 there,
 * 0.9993 · (1 + y² / 2R²), y off the central meridian (R to 0.1 % is a few millimetres a kilometre).
 */
const ground = (length: number, east: number) => {
  const y = (east - 500000) / 0.9993;
  return length / (0.9993 * (1 + (y * y) / (2 * 6383000 ** 2)));
};

describe('measure', () => {
  it('measures a line on the ellipsoid: its PL-1992 length over the scale of the projection', () => {
    // 500.3 m; OpenLayers' sphere gave 498.7 m.
    expect(
      measure(
        new LineString([
          [600000, 500000],
          [600500, 500000],
        ]),
      ),
    ).toBe(formatLength(ground(500, 600250)));
  });

  it('gives the area and perimeter of a polygon, the perimeter as a parcel has it', () => {
    // About 100 m × 100 m.
    const polygon = new Polygon([
      [
        [600000, 500000],
        [600100, 500000],
        [600100, 500100],
        [600000, 500100],
        [600000, 500000],
      ],
    ]);
    const text = plain(measure(polygon));
    expect(text).toMatch(/^(99\d\d|1\d \d{3}) m²|^1(,\d+)? ha/);
    // 400.2 m; the sphere gave 399.5 m.
    expect(text).toContain(`obwód ${formatLength(4 * ground(100, 600050))}`);
    expect(text).toContain(`obwód ${formatLength(perimeterOf(polygon))}`);
  });

  it('agrees with the ellipsoid for a line in degrees', () => {
    // A degree of the meridian at 20° E, from 51.5° to 52.5° N: 111 267.3 m on GRS80 (Vincenty's
    // formula); OpenLayers' sphere gave 111.20 km.
    const line = new LineString([fromLonLat([20, 51.5], 'EPSG:2180'), fromLonLat([20, 52.5], 'EPSG:2180')]);
    expect(measure(line)).toBe(formatLength(111267.3));
  });

  it('ignores other geometries', () => {
    expect(measure(new Point([0, 0]))).toBeUndefined();
  });
});

/** A map in jsdom with the measurement attached, drawn on with Enter at its centre. */
function keyboardMap() {
  const { map, detach: detachMap } = testMap({ zoom: 10 });
  const detachMeasure = attachMeasure(map);
  const detach = () => {
    detachMeasure();
    detachMap();
  };
  const enter = () => map.getTargetElement()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  /** A line from the centre to a point east of it. */
  const line = (east: number) => {
    map.getView().setCenter([600000, 500000]);
    enter();
    map.getView().setCenter([600000 + east, 500000]);
    enter();
    enter();
  };
  const features = () =>
    map
      .getLayers()
      .getArray()
      .flatMap((l) => (l instanceof VectorLayer ? l.getSource()!.getFeatures() : [])).length;
  return { map, detach, enter, line, features };
}

describe('measuring with the keyboard', () => {
  it('adds the centre of the map on Enter and ends the shape on a second Enter at the same place', () => {
    const { map, detach, enter } = keyboardMap();
    useMapStore.setState({ tool: 'measure-line', measureResult: '' });
    enter();
    map.getView().setCenter([601000, 500000]);
    enter();
    expect(useMapStore.getState().measureResult).toBe('');
    enter();
    expect(useMapStore.getState().measureResult).toBe(formatLength(ground(1000, 600500)));
    detach();
    useMapStore.setState({ tool: 'none', measureResult: '' });
  });
});

describe('opening a drawing tool', () => {
  it('moves the focus to the map, so the first Enter adds a point', () => {
    const { map, detach, enter } = keyboardMap();
    map.getTargetElement()!.tabIndex = 0;
    useMapStore.setState({ tool: 'none', measureResult: '', profileLine: null });
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    useMapStore.getState().setTool('profile');
    expect(document.activeElement).toBe(map.getTargetElement());
    enter();
    map.getView().setCenter([600500, 500000]);
    enter();
    enter();
    expect(useMapStore.getState().profileLine).toHaveLength(2);
    // Closing leaves the focus where it is.
    useMapStore.getState().setTool('none');
    expect(document.activeElement).toBe(map.getTargetElement());
    button.remove();
    detach();
  });
});

describe('the terrain profile tool', () => {
  it('draws one line at a time apart from the measurements, and drops it when closed', () => {
    const { detach, line, features } = keyboardMap();
    useMapStore.setState({ tool: 'measure-line', measureResult: '', profileLine: null });
    line(500);
    expect(features()).toBe(1);
    useMapStore.getState().setTool('profile');
    line(1000);
    expect(useMapStore.getState().profileLine).toEqual([
      [600000, 500000],
      [601000, 500000],
    ]);
    // A profile line is no measurement: the measurement's result stays as it was.
    expect(useMapStore.getState().measureResult).toBe(formatLength(ground(500, 600250)));
    line(2000);
    expect(useMapStore.getState().profileLine?.[1]).toEqual([602000, 500000]);
    expect(features()).toBe(2);
    useMapStore.getState().setTool('none');
    expect(useMapStore.getState().profileLine).toBeNull();
    expect(features()).toBe(1);
    detach();
    useMapStore.setState({ tool: 'none', measureResult: '' });
  });
});
