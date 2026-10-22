import { describe, expect, it } from 'vitest';
import ImageWMS from 'ol/source/ImageWMS';
import { overlayById, type Overlay } from '@/config/runtime';
import { createOverlayLayer } from './layers';
import { registerMeta } from './meta';
import { expandRange, parseValues, timeValues } from './time';

const kieg = overlayById.get('kieg')!;

describe('expandRange', () => {
  it('steps by years, months or days in the precision of the start', () => {
    expect(expandRange('2015', '2020', 'P2Y')).toEqual(['2015', '2017', '2019']);
    expect(expandRange('2023-11', '2024-02', 'P1M')).toEqual(['2023-11', '2023-12', '2024-01', '2024-02']);
    expect(expandRange('2024-02-27', '2024-03-01', 'P1D')).toEqual(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01']);
  });

  it('keeps the ends of a range it cannot step through', () => {
    expect(expandRange('2015', '2020', 'PT1H')).toEqual(['2015', '2020']);
  });
});

describe('parseValues', () => {
  it('reads lists and ranges as WMS capabilities write them', () => {
    expect(parseValues('2010, 2012/2016/P2Y')).toEqual(['2010', '2012', '2014', '2016']);
  });
});

describe('timeValues', () => {
  it('takes values and the default from the configuration, else the newest', () => {
    const listed: Overlay = { ...kieg, time: { type: 'dimension', param: 'TIME', values: ['2019', '2021'] } };
    expect(timeValues(listed)).toEqual({ param: 'TIME', values: ['2019', '2021'], current: '2021' });
    const fixed: Overlay = { ...listed, time: { type: 'dimension', param: 'TIME', values: ['2019', '2021'], default: '2019' } };
    expect(timeValues(fixed)?.current).toBe('2019');
    const series: Overlay = { ...kieg, time: { type: 'series', editions: [{ value: '2010' }, { value: '2020' }] } };
    expect(timeValues(series)).toEqual({ values: ['2010', '2020'], current: '2020' });
    expect(timeValues(kieg)).toBeUndefined();
  });

  it('reads the values a service lists in its capabilities, and draws its default', () => {
    const id = 'time-test';
    registerMeta(id, {
      kind: 'wms',
      fetchedAt: '',
      title: '',
      infoFormats: [],
      layers: { a: { title: 'A', queryable: false, dimensions: { time: { values: '2015,2018,2020', default: '2018' } } } },
    });
    const def: Overlay = {
      ...kieg,
      id,
      sublayers: [{ name: 'a', title: 'A', default: true }],
      time: { type: 'dimension', param: 'TIME', values: 'capabilities' },
    };
    expect(timeValues(def)).toEqual({ param: 'TIME', values: ['2015', '2018', '2020'], current: '2018' });
    const source = createOverlayLayer(def).getSource() as ImageWMS;
    expect(source.getParams().TIME).toBe('2018');
  });
});
