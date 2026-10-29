import { describe, expect, it, vi } from 'vitest';
import { gugikSearch } from './search';
import type { GugikHit } from './geocoder';
import { stubFetch } from '@/test/helpers';

const SQUARE = 'POLYGON((0 0,1 0,1 1,0 0))';
const BUILDING = 'POLYGON((2 2,3 2,3 3,2 2))';
const unit = { level: 'gm', teryt: '1417082', name: 'Wiązowna' } as const;

/** The outline services answer by their request: PRG with JSON rings, ULDK with "|"-separated rows. */
const services = () =>
  stubFetch([
    [
      'PRG_gugik_wyszukiwarka/MapServer/0/query',
      {
        features: [
          {
            geometry: {
              rings: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      },
    ],
    ['GetCommuneByXY', `1\nWiązowna (miasto)|SRID=2180;${SQUARE}\n`],
    ['GetBuildingByXY', `1\nSRID=2180;${BUILDING}\n`],
  ]);
const outline = (hit: Partial<GugikHit>) => gugikSearch.outline!({ kind: 'place', label: 'Wiązowna', ...hit });

describe('gugikSearch.outline', () => {
  it('fetches the boundary of a unit, giving it up to 8 s, and keeps it on the map', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    services();
    await expect(outline({ kind: 'unit', unit })).resolves.toEqual({ wkt: SQUARE, persist: true });
    expect(timeout).toHaveBeenCalledWith(8000);
  });

  it('outlines a place for a while and a building at an address for good, giving each 2.5 s', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const { calls } = services();
    await expect(outline({ kind: 'place', center: [1, 1] })).resolves.toEqual({ wkt: SQUARE, persist: false });
    await expect(outline({ kind: 'address', center: [1, 1] })).resolves.toEqual({ wkt: BUILDING, persist: true, sides: true });
    expect(calls.map((url) => new URL(url).searchParams.get('request'))).toEqual(['GetCommuneByXY', 'GetBuildingByXY']);
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([2500, 2500]);
  });

  it('keeps a parcel or a river by the geometry the search gave; an address with no building goes with its point', async () => {
    stubFetch([['GetBuildingByXY', '-1 brak wyników']]);
    await expect(outline({ kind: 'parcel', wkt: SQUARE })).resolves.toEqual({ wkt: SQUARE, persist: true, sides: true });
    // A river or a reserve stays, but gets no side lengths: those are for parcels and buildings.
    await expect(outline({ kind: 'nature', wkt: 'LINESTRING(0 0,1 1)' })).resolves.toEqual({
      wkt: 'LINESTRING(0 0,1 1)',
      persist: true,
      sides: false,
    });
    await expect(outline({ kind: 'nature' })).resolves.toEqual({ wkt: undefined, persist: false, sides: false });
    await expect(outline({ kind: 'address', center: [1, 1] })).resolves.toEqual({ wkt: undefined, persist: false, sides: false });
  });

  it('gives up an outline whose time has run out, keeping a unit on the map without one', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => AbortSignal.abort(new DOMException('Timed out', 'TimeoutError')));
    // A service that never answers: the request fails only through its signal.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        init?.signal?.aborted ? Promise.reject(init.signal.reason) : new Promise<Response>(() => {}),
      ),
    );
    await expect(outline({ kind: 'unit', unit })).resolves.toEqual({ wkt: undefined, persist: true });
    await expect(outline({ kind: 'place', center: [1, 1] })).resolves.toEqual({ wkt: undefined, persist: false });
  });
});
