import { describe, expect, it } from 'vitest';
import ImageWMS from 'ol/source/ImageWMS';
import { overlayById, type Overlay } from '@/config/runtime';
import { createOverlayLayer } from './layers';
import { registerMeta } from './meta';
import { expandRange, parseValues, timeValues, valueAt, yearly } from './time';

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

  it('takes a date written with midnight as the date', () => {
    expect(parseValues('1995-01-01T00:00:00.000Z/1995-03-01T00:00:00.000Z/P1M')).toEqual(['1995-01-01', '1995-02-01', '1995-03-01']);
    expect(parseValues('2015-06-01T12:00:00Z')).toEqual(['2015-06-01T12:00:00Z']);
  });

  it('gives the same array for the same list, so what was made of it can be kept', () => {
    expect(parseValues('1995-01-01/2025-11-01/P1M')).toBe(parseValues('1995-01-01/2025-11-01/P1M'));
  });
});

describe('timeValues', () => {
  it('takes values and the default from the configuration, else the newest', () => {
    const listed: Overlay = { ...kieg, time: { type: 'dimension', param: 'TIME', values: ['2019', '2021'] } };
    expect(timeValues(listed)).toEqual({ param: 'TIME', values: ['2019', '2021'], current: '2021' });
    const fixed: Overlay = { ...listed, time: { type: 'dimension', param: 'TIME', values: ['2019', '2021'], default: '2019' } };
    expect(timeValues(fixed)?.current).toBe('2019');
    const series: Overlay = { ...kieg, time: { type: 'series', editions: [{ value: '2010' }, { value: '2020' }] } };
    expect(timeValues(series)).toEqual({ values: ['2010', '2020'], current: '2020', editions: { '2010': {}, '2020': {} } });
    const named: Overlay = {
      ...kieg,
      time: {
        type: 'series',
        editions: [
          { value: '1965', layer: 'a,b', label: 'Układ 1965' },
          { value: '1992', layer: 'c' },
        ],
      },
    };
    expect(timeValues(named)?.editions).toEqual({ '1965': { layer: 'a,b', label: 'Układ 1965' }, '1992': { layer: 'c' } });
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
    expect(timeValues(def)?.values).toBe(timeValues(def)?.values);
    const source = createOverlayLayer(def).getSource() as ImageWMS;
    expect(source.getParams().TIME).toBe('2018');
  });

  it('steps through a configured range once', () => {
    const def: Overlay = { ...kieg, time: { type: 'dimension', param: 'TIME', values: { start: '2015', end: '2020', step: 'P1Y' } } };
    expect(timeValues(def)).toEqual({ param: 'TIME', values: ['2015', '2016', '2017', '2018', '2019', '2020'], current: '2020' });
    expect(timeValues(def)?.values).toBe(timeValues(def)?.values);
  });

  it('draws without the parameter while the capabilities are not read yet', () => {
    const def: Overlay = {
      ...kieg,
      id: 'time-unknown',
      sublayers: [{ name: 'a', title: 'A', default: true }],
      time: { type: 'dimension', param: 'TIME', values: 'capabilities' },
    };
    expect(timeValues(def)).toEqual({ param: 'TIME', values: [] });
    expect((createOverlayLayer(def).getSource() as ImageWMS).getParams().TIME).toBeUndefined();
  });
});

describe('valueAt', () => {
  it('gives the latest value not after the wanted date, else the first', () => {
    const values = ['2001-05-13', '2011-04-21', '2025-04-27'];
    expect(valueAt(values, '2015-06-01')).toBe('2011-04-21');
    expect(valueAt(values, '2011-04-21')).toBe('2011-04-21');
    expect(valueAt(values, '2030')).toBe('2025-04-27');
    expect(valueAt(values, '1999')).toBe('2001-05-13');
    expect(valueAt([], '2010')).toBeUndefined();
  });
});

describe('yearly', () => {
  it('keeps the first value of each year', () => {
    expect(yearly(['2023-11', '2023-12', '2024-01', '2024-02'])).toEqual(['2023-11', '2024-01']);
    expect(yearly(['2015', '2018'])).toEqual(['2015', '2018']);
  });
});
