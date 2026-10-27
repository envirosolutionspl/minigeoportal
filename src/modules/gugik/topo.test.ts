import { describe, expect, it } from 'vitest';
import { timeOptionsAt, topoAt } from './topo';
import { stubFetch } from '@/test/helpers';

const SHEETS = [
  { date: '1982', scale: 25000, system: '1965', layer: 'Raster_25_1965', sheet: '263.34' },
  { date: '1982', scale: 10000, system: '1965', layer: 'Raster_10_1965', sheet: '263.344' },
  { date: '1993', scale: 10000, system: '1942', layer: 'Raster_10_1942', sheet: 'N-34-139-A-c-1' },
];

describe('topo', () => {
  it('asks the backend at the rounded point, and says when it did not answer', async () => {
    const { calls } = stubFetch([['/api/topo', { sheets: [] }]]);
    expect(await topoAt([636500.4, 486499.6], new AbortController().signal)).toEqual({ sheets: [] });
    expect(calls).toEqual(['/api/topo?x=636500&y=486500']);
    stubFetch([['/api/topo', 'down', { status: 503 }]]);
    await expect(topoAt([0, 0], new AbortController().signal)).rejects.toThrow('HTTP 503');
  });

  it('offers one date a day, drawing every sheet of the day, named by their scales and systems', async () => {
    stubFetch([['/api/topo', { sheets: SHEETS }]]);
    const options = await timeOptionsAt([636500, 486500], new AbortController().signal);
    expect(options.map((o) => [o.value, o.layer])).toEqual([
      ['1982', 'Raster_25_1965,Raster_10_1965'],
      ['1993', 'Raster_10_1942'],
    ]);
    expect(options[0].detail).toMatch(/^arkusz 1:25\s000 w układzie 1965 · arkusz 1:10\s000 w układzie 1965$/);
  });
});
