import { beforeEach, describe, expect, it } from 'vitest';
import { addParcel, toggleParcelAt, useParcelStore } from './parcels';
import { useMapStore } from './store';
import { stubFetch } from '@/test/helpers';

/** A ULDK answer: a count line, then one row of id, units, number and outline (a 100 m square). */
const uldk = (id: string, x: number, y: number) =>
  `0\n${id}|mazowieckie|powiat miński|Mińsk Mazowiecki (miasto)|Mińsk Mazowiecki|${id.split('.').pop()}|SRID=2180;POLYGON((${x} ${y},${x + 100} ${y},${x + 100} ${y + 100},${x} ${y + 100},${x} ${y}))`;

/** Lets the requests of the store answer. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  useMapStore.setState({ parcels: [], tool: 'parcels' });
  useParcelStore.setState({ entries: {}, message: '' });
});

describe('the parcel selection', () => {
  it('adds the parcel clicked, with its area from the geometry, and removes it on a second click without asking again', async () => {
    const { calls } = stubFetch([['GetParcelByXY', uldk('141201_1.0001.12', 675000, 482000)]]);
    await toggleParcelAt([675050, 482050]);
    expect(useMapStore.getState().parcels).toEqual(['141201_1.0001.12']);
    const entry = useParcelStore.getState().entries['141201_1.0001.12'];
    expect(entry.status).toBe('ready');
    // 100 m on the map is a little more on the ground, away from the central meridian too.
    expect(entry.status === 'ready' && entry.area).toBeGreaterThan(10000);
    expect(useParcelStore.getState().message).toBe('Dodano działkę 141201_1.0001.12.');
    await toggleParcelAt([675010, 482090]);
    expect(useMapStore.getState().parcels).toEqual([]);
    expect(useParcelStore.getState().message).toBe('Usunięto działkę 141201_1.0001.12.');
    expect(calls).toHaveLength(1);
  });

  it('says when there is no parcel at the point or ULDK does not answer', async () => {
    stubFetch([['GetParcelByXY', '-1 brak wyników']]);
    await toggleParcelAt([1, 2]);
    expect(useParcelStore.getState().message).toBe('W tym miejscu nie ma działki.');
    stubFetch([]);
    await toggleParcelAt([1, 2]);
    expect(useMapStore.getState().parcels).toEqual([]);
  });

  it('keeps each parcel once and at most ten, saying why it adds no more', async () => {
    stubFetch([['GetParcelById', uldk('141201_1.0001.1', 675000, 482000)]]);
    addParcel('141201_1.0001.1');
    addParcel('141201_1.0001.1');
    expect(useMapStore.getState().parcels).toEqual(['141201_1.0001.1']);
    expect(useParcelStore.getState().message).toBe('Działka 141201_1.0001.1 jest już w selekcji.');
    useMapStore.setState({ parcels: Array.from({ length: 10 }, (_, i) => `141201_1.0001.${i + 1}`) });
    addParcel('141201_1.0001.11');
    expect(useMapStore.getState().parcels).toHaveLength(10);
    expect(useParcelStore.getState().message).toBe('Selekcja ma już 10 działek: usuń którąś, aby dodać kolejną.');
    await toggleParcelAt([1, 2]);
    expect(useParcelStore.getState().message).toBe('Selekcja ma już 10 działek: usuń którąś, aby dodać kolejną.');
  });

  it('fetches the parcels of a link, and marks the ones ULDK does not know instead of dropping them', async () => {
    stubFetch([
      ['id=141201_1.0001.1867', uldk('141201_1.0001.1867', 675000, 482000)],
      ['id=141201_1.0001.9999', '-1 brak wyników'],
    ]);
    useMapStore.setState({ parcels: ['141201_1.0001.1867', '141201_1.0001.9999'] });
    expect(useParcelStore.getState().entries['141201_1.0001.1867'].status).toBe('loading');
    await settle();
    await settle();
    const { entries } = useParcelStore.getState();
    expect(entries['141201_1.0001.1867'].status).toBe('ready');
    expect(entries['141201_1.0001.9999'].status).toBe('missing');
    expect(useMapStore.getState().parcels).toHaveLength(2);
  });
});
