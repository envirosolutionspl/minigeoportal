import { afterEach, describe, expect, it, vi } from 'vitest';
import MapBrowserEvent from 'ol/MapBrowserEvent';
import WKT from 'ol/format/WKT';
import type Feature from 'ol/Feature';
import type SimpleGeometry from 'ol/geom/SimpleGeometry';
import VectorLayer from 'ol/layer/Vector';
import { attachParcels } from './parcels';
import { useMapStore } from '@/state/store';
import { useParcelStore } from '@/state/parcels';
import { testMap } from '@/test/helpers';

const geometry = new WKT().readGeometry('POLYGON((600000 500000,600100 500000,600100 500100,600000 500100,600000 500000))');

/** A pointer moved over the map, by a mouse or a finger. */
const move = (map: ReturnType<typeof testMap>['map'], pointerType: string) =>
  map.dispatchEvent(new MapBrowserEvent('pointermove', map, new PointerEvent('pointermove', { pointerType, clientX: 400, clientY: 300 })));

afterEach(() => {
  useMapStore.setState({ parcels: [], tool: 'none' });
  useParcelStore.setState({ entries: {}, message: '' });
});

describe('parcels on the map', () => {
  it('shows the number and area of the selected parcel under the mouse, and nothing for a finger', () => {
    useParcelStore.setState({
      entries: {
        '141201_1.0001.12': {
          status: 'ready',
          parcel: { id: '141201_1.0001.12', voivodeship: '', county: '', commune: '', region: 'Mińsk', number: '12', wkt: '' },
          geometry,
          area: 10012,
        },
      },
    });
    useMapStore.setState({ parcels: ['141201_1.0001.12'] });
    const { map, detach } = testMap();
    const detachParcels = attachParcels(map);
    // jsdom draws nothing to hit: the feature of the selection's layer stands for what is under the pointer.
    const layer = map
      .getLayers()
      .getArray()
      .find((l): l is VectorLayer => l instanceof VectorLayer)!;
    const parcel = layer.getSource()!.getFeatures()[0] as Feature;
    const hit = vi
      .spyOn(map, 'forEachFeatureAtPixel')
      .mockImplementation((_pixel, callback) => callback(parcel, layer, parcel.getGeometry() as SimpleGeometry));
    const tip = map.getOverlays().item(0);

    move(map, 'mouse');
    expect(tip.getElement()!.textContent?.replace(/\s/g, ' ')).toBe('1. dz. 12, obręb Mińsk · 1,0012 ha (10 012 m²), obwód 400,2 m');
    expect(tip.getPosition()).toBeDefined();

    move(map, 'touch');
    expect(tip.getPosition()).toBeUndefined();

    hit.mockReturnValue(undefined);
    move(map, 'mouse');
    expect(tip.getPosition()).toBeUndefined();

    detachParcels();
    expect(map.getOverlays().getLength()).toBe(0);
    detach();
  });
});
