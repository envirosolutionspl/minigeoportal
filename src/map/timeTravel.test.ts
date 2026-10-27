import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Map from 'ol/Map';
import View from 'ol/View';
import ImageLayer from 'ol/layer/Image';
import ImageWMS from 'ol/source/ImageWMS';
import { ImageSourceEvent } from 'ol/source/Image';
import type ImageWrapper from 'ol/Image';
import { PROJECTION, scaleToResolution } from './projection';
import { attachTimeTravel, sublayersFor, timeCaption, timeLayerDrawsAt, timeLayers } from './timeTravel';
import { overlayById } from '@/config/runtime';
import { registerMeta } from '@/services/meta';
import { useMapStore } from '@/state/store';

/** What the blank check (blank.ts, which needs a real canvas) says of the next image. */
const blank = vi.hoisted(() => ({ next: false }));
vi.mock('./blank', () => ({ isBlank: () => blank.next }));

let map: Map;
let detach: () => void;

/** The map's layers of the time view (map.yaml: timeTravel): the archival orthophoto map and the old maps. */
const wmsLayer = (url: string) =>
  map
    .getLayers()
    .getArray()
    .find(
      (l): l is ImageLayer<ImageWMS> =>
        l instanceof ImageLayer && l.getSource() instanceof ImageWMS && l.getSource()!.getUrl()!.includes(url),
    )!;
const timeLayer = () => wmsLayer('StandardResolutionTime');
const oldMaps = () => wmsLayer('TOPO_SERIA');

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  registerMeta('orto-archiwalna', {
    kind: 'wms',
    fetchedAt: '',
    title: '',
    infoFormats: [],
    layers: {
      Raster: { title: 'Raster', queryable: false, maxScale: 47247, dimensions: { time: { values: '1995-01-01/2025-11-01/P1M' } } },
    },
  });
  registerMeta('mapy-dawne', {
    kind: 'wms',
    fetchedAt: '',
    title: '',
    infoFormats: [],
    layers: {
      Raster_50_1942: { title: '', queryable: false, maxScale: 94493 },
      Raster_10_1942: { title: '', queryable: false, maxScale: 23623 },
      Raster_50_1965: { title: '', queryable: false, maxScale: 94493 },
      Raster_25_1965: { title: '', queryable: false, maxScale: 47246 },
      Raster_10_1965: { title: '', queryable: false, maxScale: 23623 },
      Raster_50_1992: { title: '', queryable: false, maxScale: 94493 },
      Raster_10_1992: { title: '', queryable: false, maxScale: 23623 },
    },
  });
  useMapStore.setState({ tool: 'none', time: null, timeLayer: null, timeStatus: 'idle', focus: null, printFromTime: false });
  map = new Map({
    target: document.createElement('div'),
    view: new View({ projection: PROJECTION, center: [600000, 500000], resolution: scaleToResolution(10000) }),
    controls: [],
    interactions: [],
  });
  map.setSize([800, 600]);
  detach = attachTimeTravel(map);
});

afterEach(() => {
  detach();
  map.setTarget(undefined);
});

describe('attachTimeTravel', () => {
  it('draws the layer only in the time view, as JPEG, at the chosen date', () => {
    const layer = timeLayer();
    expect(layer.getVisible()).toBe(false);
    expect(layer.getZIndex()).toBe(5);
    useMapStore.getState().setTool('time');
    expect(layer.getVisible()).toBe(true);
    const params = layer.getSource()!.getParams();
    expect(params).toMatchObject({ LAYERS: 'Raster', FORMAT: 'image/jpeg', TRANSPARENT: false, TIME: '2025-11-01' });
    useMapStore.getState().setTime('2007-01-01');
    expect(layer.getSource()!.getParams().TIME).toBe('2007-01-01');
    useMapStore.getState().setTool('none');
    expect(layer.getVisible()).toBe(false);
  });

  it('keeps to the scales the service draws at', () => {
    useMapStore.getState().setTool('time');
    const layer = timeLayer();
    expect(layer.getMaxResolution()).toBeCloseTo(scaleToResolution(47247), 6);
    expect(timeLayerDrawsAt(null, null, null, 10000)).toBe(true);
    expect(timeLayerDrawsAt(null, null, null, 100000)).toBe(false);
    // The old maps draw further out: their 1:50 000 sheets, up to 1:94 493; a named 1:10 000 sheet only up to 1:23 623.
    expect(timeLayerDrawsAt('mapy-dawne', '1965', null, 60000)).toBe(true);
    expect(timeLayerDrawsAt('mapy-dawne', '1965', null, 100000)).toBe(false);
    expect(timeLayerDrawsAt('mapy-dawne', '1982', 'Raster_10_1965', 60000)).toBe(false);
    expect(timeLayerDrawsAt('mapy-dawne', '1982', 'Raster_10_1965', 20000)).toBe(true);
  });

  it('shows one layer at a time: the old maps draw the sheets of the chosen system, finest last', () => {
    expect(timeLayers().map((l) => l.def.id)).toEqual(['orto-archiwalna', 'mapy-dawne']);
    useMapStore.getState().setTool('time');
    expect(timeLayer().getVisible()).toBe(true);
    expect(oldMaps().getVisible()).toBe(false);
    useMapStore.getState().setTimeLayer('mapy-dawne');
    useMapStore.getState().setTime('1965');
    expect(timeLayer().getVisible()).toBe(false);
    expect(oldMaps().getVisible()).toBe(true);
    expect(oldMaps().getSource()!.getParams().LAYERS).toBe('Raster_50_1965,Raster_25_1965,Raster_10_1965');
    expect(oldMaps().getSource()!.getParams().TIME).toBeUndefined();
    expect(oldMaps().getMaxResolution()).toBeCloseTo(scaleToResolution(94493), 6);
    // A date between editions shows the latest edition before it.
    useMapStore.getState().setTime('1980');
    expect(oldMaps().getSource()!.getParams().LAYERS).toBe('Raster_50_1965,Raster_25_1965,Raster_10_1965');
    const def = overlayById.get('mapy-dawne')!;
    expect(sublayersFor(def, timeLayers()[1].spec, undefined)).toEqual(['Raster_50_1992', 'Raster_10_1992']);
    // A module naming the sheets of a date (the index of topographic maps) wins over the edition.
    useMapStore.getState().setTime('1982');
    useMapStore.getState().setTimeSublayers('Raster_25_1965,Raster_10_1965');
    expect(oldMaps().getSource()!.getParams().LAYERS).toBe('Raster_25_1965,Raster_10_1965');
    expect(oldMaps().getMaxResolution()).toBeCloseTo(scaleToResolution(47246), 6);
    useMapStore.getState().setTimeSublayers(null);
    expect(oldMaps().getSource()!.getParams().LAYERS).toBe('Raster_50_1965,Raster_25_1965,Raster_10_1965');
  });

  it('stays on a print opened from the view, and names its layer and date for the footer', () => {
    useMapStore.getState().setTool('time');
    useMapStore.getState().setTime('2007-01-01');
    useMapStore.getState().setTool('print');
    expect(timeLayer().getVisible()).toBe(true);
    expect(timeLayer().getSource()!.getParams().TIME).toBe('2007-01-01');
    useMapStore.getState().setTool('measure-line');
    expect(timeLayer().getVisible()).toBe(false);
    expect(timeCaption(null, '2007-01-01')).toBe('Ortofotomapa archiwalna, stan na 01.01.2007');
    expect(timeCaption('mapy-dawne', '1982')).toBe('Mapy topograficzne dawne, stan na 1982');
    expect(timeCaption('mapy-dawne', '1965')).toBe('Mapy topograficzne dawne: Mapy w układzie 1965');
    expect(timeCaption(null, null)).toBeNull();
  });

  it('zooms in when the view opens too far out for the layer', () => {
    useMapStore.getState().setTool('time');
    expect(useMapStore.getState().focus).toBeNull();
    useMapStore.getState().setTool('none');
    map.getView().setResolution(scaleToResolution(500000));
    useMapStore.getState().setTool('time');
    expect(useMapStore.getState().focus?.scale).toBe(20000);
  });

  it('reports the loading of the image, fading the last one meanwhile, and asks for it again on a retry', () => {
    const layer = timeLayer();
    const source = layer.getSource()!;
    expect((source as unknown as { ratio_: number }).ratio_).toBe(1);
    useMapStore.getState().setTool('time');
    source.dispatchEvent('imageloadstart');
    expect(useMapStore.getState().timeStatus).toBe('loading');
    expect(layer.getOpacity()).toBe(0.5);
    source.dispatchEvent('imageloaderror');
    expect(useMapStore.getState().timeStatus).toBe('error');
    const refresh = vi.spyOn(source, 'refresh');
    useMapStore.getState().retryTime();
    expect(refresh).toHaveBeenCalled();
    source.dispatchEvent('imageloadend');
    expect(useMapStore.getState().timeStatus).toBe('idle');
    expect(layer.getOpacity()).toBe(1);
  });

  it('asks with CORS and tells a blank image from a picture', () => {
    const source = timeLayer().getSource()!;
    expect((source as unknown as { crossOrigin_: string }).crossOrigin_).toBe('anonymous');
    useMapStore.getState().setTool('time');
    const image = { getImage: () => document.createElement('img') } as unknown as ImageWrapper;
    blank.next = true;
    source.dispatchEvent(new ImageSourceEvent('imageloadend', image));
    expect(useMapStore.getState().timeStatus).toBe('blank');
    blank.next = false;
    source.dispatchEvent(new ImageSourceEvent('imageloadend', image));
    expect(useMapStore.getState().timeStatus).toBe('idle');
  });

  it('goes with the map', () => {
    detach();
    expect(
      map
        .getLayers()
        .getArray()
        .some((l) => l instanceof ImageLayer),
    ).toBe(false);
    detach = () => {};
  });
});
