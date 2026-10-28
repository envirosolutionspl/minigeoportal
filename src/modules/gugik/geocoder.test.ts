import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildingAt, findParcels, placeOutline, search, stripSrid, unitLabel, unitOutline } from './geocoder';
import { clearUnitNames } from './units';
import { stubFetch } from '@/test/helpers';

// A failing test with fake timers must not leave them to the next one.
afterEach(() => vi.useRealTimers());

beforeEach(() => clearUnitNames());

const signal = () => new AbortController().signal;

const UUG_STREET = {
  type: 'street',
  results: {
    1: {
      city: 'Wiązowna',
      street: 'Firletki',
      number: null,
      teryt: '141708',
      x: '656753.84',
      y: '482462.38',
      geometry_wkt: 'MULTILINESTRING((1 2,3 4))',
    },
  },
};
const UUG_CITY = {
  type: 'city',
  results: { 1: { city: 'Otwock', teryt: '141702', x: '656860', y: '474612', geometry_wkt: 'POINT(656860 474612)' } },
};
const UUG_TWO_PLACES = {
  type: 'city',
  results: {
    1: { city: 'Komaszyce', teryt: '040704', x: '454776', y: '546382' },
    2: { city: 'Komaszyce', teryt: '260502', x: '601729', y: '376839' },
  },
};
const UUG_ADDRESS = {
  type: 'address',
  results: {
    1: {
      city: 'Kraków',
      citypart: 'Stare Miasto',
      street: 'Rynek Główny',
      number: '1',
      teryt: '126101',
      x: '567009.37',
      y: '244218.48',
      geometry_wkt: 'POINT(567009.37 244218.48)',
    },
    2: { city: 'Kraków', street: 'Mały Rynek', number: '1', x: 'abc', y: '1' },
  },
};
const UNITS = {
  '141708': { voivodeship: 'mazowieckie', county: 'otwocki', commune: 'Wiązowna' },
  '141702': { voivodeship: 'mazowieckie', county: 'otwocki', commune: 'Otwock' },
  '040704': { voivodeship: 'kujawsko-pomorskie', county: 'brodnicki', commune: 'Brzozie' },
  '260502': { voivodeship: 'świętokrzyskie', county: 'kielecki', commune: 'Bodzentyn' },
  '126101': { voivodeship: 'małopolskie', county: 'Kraków' },
};
const ULDK_PARCEL = '1\n141708_2.0021.22/1|Wiązowna|Wiązowna Gminna|22/1|SRID=2180;POLYGON((0 0,1 0,1 1,0 0))\n';

describe('search', () => {
  it('maps geocoder answers to hits with kind, label, detail and geometry', async () => {
    stubFetch([
      ['services.gugik.gov.pl/uug', UUG_ADDRESS],
      ['/api/dict/jednostki', UNITS],
    ]);
    const hits = await search('Kraków, Rynek Główny 1', signal());
    // Kraków is its own county, so no county is repeated after the city.
    expect(hits).toEqual([
      {
        kind: 'address',
        label: 'Rynek Główny 1',
        detail: 'Stare Miasto, Kraków',
        center: [567009.37, 244218.48],
        wkt: 'POINT(567009.37 244218.48)',
        teryt: '126101',
      },
    ]);
  });

  it('labels streets and places with their county and municipality', async () => {
    stubFetch([
      ['services.gugik.gov.pl/uug', UUG_STREET],
      ['/api/dict/jednostki', UNITS],
    ]);
    expect((await search('Wiązowna, Firletki', signal()))[0]).toMatchObject({
      kind: 'street',
      label: 'Firletki',
      detail: 'Wiązowna, pow. otwocki',
    });
    stubFetch([
      ['services.gugik.gov.pl/uug', UUG_CITY],
      ['/api/dict/jednostki', UNITS],
    ]);
    expect((await search('Otwock', signal()))[0]).toMatchObject({
      kind: 'place',
      label: 'Otwock',
      detail: 'pow. otwocki, woj. mazowieckie',
    });
  });

  it('tells two places of one name apart and asks for the names once', async () => {
    const { calls } = stubFetch([
      ['services.gugik.gov.pl/uug', UUG_TWO_PLACES],
      ['/api/dict/jednostki', UNITS],
    ]);
    const hits = await search('Komaszyce', signal());
    expect(hits.map((h) => h.detail)).toEqual([
      'gm. Brzozie, pow. brodnicki, woj. kujawsko-pomorskie',
      'gm. Bodzentyn, pow. kielecki, woj. świętokrzyskie',
    ]);
    expect(calls.filter((c) => c.includes('/api/dict/jednostki'))).toEqual(['/api/dict/jednostki?teryt=040704,260502']);
    await search('Komaszyce', signal());
    expect(calls.filter((c) => c.includes('/api/dict/jednostki'))).toHaveLength(1);
  });

  it('still lists places when the names cannot be loaded', async () => {
    stubFetch([
      ['services.gugik.gov.pl/uug', UUG_CITY],
      ['/api/dict/jednostki', 'down', { status: 503 }],
    ]);
    expect((await search('Otwock', signal()))[0]).toMatchObject({ detail: 'Miejscowość' });
  });

  it('sends a full parcel id to ULDK only', async () => {
    const { calls } = stubFetch([['uldk.gugik.gov.pl', ULDK_PARCEL]]);
    const hits = await search('141708_2.0021.22/1', signal());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('request=GetParcelByIdOrNr');
    expect(hits).toEqual([
      {
        kind: 'parcel',
        label: 'Działka 22/1',
        detail: 'obręb Wiązowna Gminna, gm. Wiązowna · 141708_2.0021.22/1',
        wkt: 'POLYGON((0 0,1 0,1 1,0 0))',
        scale: 500,
        id: '141708_2.0021.22/1',
      },
    ]);
  });

  it('asks both services for "precinct number" and lists parcels first', async () => {
    const { calls } = stubFetch([
      ['uldk.gugik.gov.pl', ULDK_PARCEL],
      ['services.gugik.gov.pl/uug', UUG_STREET],
      ['/api/dict/jednostki', UNITS],
    ]);
    const hits = await search('Wiązowna Gminna 22/1', signal());
    expect(calls.filter((c) => !c.includes('/api/'))).toHaveLength(2);
    expect(hits.map((h) => h.kind)).toEqual(['parcel', 'street']);
  });

  it('does not wait for a service that does not answer: shows the others and names it', async () => {
    vi.useFakeTimers();
    // The full-text search hangs until it is given up; the address search answers at once.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('capap.gugik.gov.pl'))
          return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
        if (url.includes('services.gugik.gov.pl/uug')) return new Response(JSON.stringify(UUG_TWO_PLACES));
        return new Response(url.includes('/api/dict/szukaj') ? '[]' : '{}', { headers: { 'content-type': 'application/json' } });
      }),
    );
    const found = search('Komaszyce', signal());
    await vi.advanceTimersByTimeAsync(4100);
    const hits = await found;
    expect(hits.map((h) => h.label)).toEqual(['Komaszyce', 'Komaszyce']);
    expect(hits.unavailable).toEqual(['wyszukiwarka nazw miejscowości i obiektów (PRNG)']);
  });

  it('names nothing when every service answered', async () => {
    stubFetch([
      ['services.gugik.gov.pl/uug', UUG_CITY],
      ['capap.gugik.gov.pl', { type: 'FeatureCollection', features: [] }],
      ['/api/dict', []],
    ]);
    expect((await search('Otwock', signal())).unavailable).toBeUndefined();
  });

  it('survives one failing service and an empty ULDK answer', async () => {
    stubFetch([
      ['uldk.gugik.gov.pl', '-1 brak wyników'],
      ['services.gugik.gov.pl/uug', 'error', { status: 500 }],
    ]);
    expect(await search('Nigdzie 1', signal())).toEqual([]);
  });
});

describe('findParcels and stripSrid', () => {
  it('drops rows without geometry and strips the SRID prefix', async () => {
    stubFetch([['uldk.gugik.gov.pl', '2\nid1|g|r|1|\nid2|g|r|2|SRID=2180;POINT(1 1)\n']]);
    expect(await findParcels('r 1', signal())).toEqual([
      { kind: 'parcel', label: 'Działka 2', detail: 'obręb r, gm. g · id2', wkt: 'POINT(1 1)', scale: 500, id: 'id2' },
    ]);
    expect(stripSrid('SRID=4326;POINT(0 0)')).toBe('POINT(0 0)');
  });

  it('takes no precinct for a parcel: a number ULDK cannot read brings back the precinct, without a number', async () => {
    stubFetch([['uldk.gugik.gov.pl', '1\n060204_2.0003|Biszcza|Bukowina||SRID=2180;MULTIPOLYGON(((0 0,1 0,1 1,0 0)))\n']]);
    expect(await findParcels('060204_2.0003.Yih', signal())).toEqual([]);
  });
});

const FTS_GORZOW = {
  features: [
    {
      properties: {
        NAZWAGLOWNA: 'Gorzów',
        RODZAJOBIEKTU: 'wieś',
        GMINA: 'Chełmek-gmina miejsko-wiejska',
        POWIAT: 'oświęcimski',
        WOJEWODZTWO: 'małopolskie',
        IDENTYFIKATORGMINY: '1213042',
      },
      geometry: { type: 'Point', coordinates: [19.25, 50.1] },
    },
    {
      properties: {
        NAZWAGLOWNA: 'Gorzów Wielkopolski',
        RODZAJOBIEKTU: 'miasto',
        GMINA: 'Gorzów Wielkopolski-gmina miejska',
        POWIAT: 'Gorzów Wielkopolski',
        WOJEWODZTWO: 'lubuskie',
        IDENTYFIKATORGMINY: '0861011',
      },
      geometry: { type: 'Point', coordinates: [15.23, 52.73] },
    },
    {
      properties: {
        NAZWAGLOWNA: 'Gorzków',
        RODZAJOBIEKTU: 'wieś',
        GMINA: 'Gorzków-gmina wiejska',
        POWIAT: 'krasnostawski',
        WOJEWODZTWO: 'lubelskie',
        IDENTYFIKATORGMINY: '0607032',
      },
      geometry: { type: 'Point', coordinates: [22.9, 50.9] },
    },
    {
      properties: { NAZWAGLOWNA: 'Gorzów Śląski', RODZAJOBIEKTU: 'część miasta', GMINA: 'x', IDENTYFIKATORGMINY: '1' },
      geometry: { type: 'Point', coordinates: [18.4, 51] },
    },
  ],
};

describe('search with the full-text place index', () => {
  it('finds towns whose name starts with the query, towns first, without loose matches', async () => {
    const { calls } = stubFetch([['idx=prngjo', FTS_GORZOW]]);
    const hits = await search('gorzów', signal());
    expect(hits.map((h) => [h.label, h.detail])).toEqual([
      ['Gorzów Wielkopolski', 'woj. lubuskie'],
      ['Gorzów', 'gm. Chełmek, pow. oświęcimski, woj. małopolskie'],
    ]);
    expect(hits[0]).toMatchObject({ kind: 'place', teryt: '086101' });
    expect(calls.some((c) => c.includes('idx=prngjo'))).toBe(true);
    // Full voivodeship in the detail: no extra lookup of unit names.
    expect(calls.some((c) => c.includes('/api/dict/jednostki'))).toBe(false);
  });

  it('does not ask the full-text index for addresses or parcel numbers', async () => {
    const { calls } = stubFetch([
      ['services.gugik.gov.pl/uug', UUG_ADDRESS],
      ['/api/dict/jednostki', UNITS],
    ]);
    await search('Kraków, Rynek Główny 1', signal());
    expect(calls.some((c) => c.includes('capap'))).toBe(false);
  });

  it('keeps one hit for a place both sources know', async () => {
    const uug = { type: 'city', results: { 1: { city: 'Gorzów', teryt: '121304', x: '1', y: '2' } } };
    stubFetch([
      ['services.gugik.gov.pl/uug', uug],
      ['idx=prngjo', FTS_GORZOW],
      ['/api/dict/jednostki', {}],
    ]);
    const hits = await search('gorzów', signal());
    expect(hits.map((h) => h.label)).toEqual(['Gorzów Wielkopolski', 'Gorzów']);
  });
});

describe('search for units and physiographic objects', () => {
  const UNITS_ANSWER = [
    { level: 'gm', teryt: '1417082', name: 'Wiązowna', county: 'otwocki', voivodeship: 'mazowieckie' },
    { level: 'pow', teryt: '1417', name: 'otwocki', voivodeship: 'mazowieckie' },
  ];
  const lonLat = (e: number, n: number) => [e, n];
  const NATURE = {
    features: [
      {
        properties: { NAZWAGLOWNA: 'Czarna Hańcza', RODZAJOBIEKTU: 'rzeka' },
        geometry: { type: 'MultiPoint', coordinates: [lonLat(23.0, 54.1), lonLat(23.2, 54.0), lonLat(23.4, 53.9)] },
      },
      { properties: { NAZWAGLOWNA: 'Hańcza', RODZAJOBIEKTU: 'jezioro' }, geometry: { type: 'Point', coordinates: lonLat(22.8, 54.26) } },
      { properties: { NAZWAGLOWNA: 'Jańcza', RODZAJOBIEKTU: 'polana' }, geometry: { type: 'Point', coordinates: lonLat(20, 49.3) } },
    ],
  };

  it('labels units by level and lists them after towns', async () => {
    stubFetch([
      ['/api/dict/szukaj', UNITS_ANSWER],
      ['idx=prngjo', FTS_GORZOW],
    ]);
    const hits = await search('wiązowna', signal());
    expect(hits.filter((h) => h.kind === 'unit')).toEqual([
      {
        kind: 'unit',
        label: 'gmina Wiązowna',
        detail: 'gmina wiejska, pow. otwocki, woj. mazowieckie',
        unit: { level: 'gm', teryt: '1417082', name: 'Wiązowna' },
      },
      { kind: 'unit', label: 'powiat otwocki', detail: 'woj. mazowieckie', unit: { level: 'pow', teryt: '1417', name: 'otwocki' } },
    ]);
    expect(unitLabel('pow', '1261', 'Kraków')).toBe('miasto na prawach powiatu Kraków');
    expect(unitLabel('woj', '14', 'mazowieckie')).toBe('województwo mazowieckie');
  });

  it('finds physiographic objects by any word of the name and says where points lie', async () => {
    const { calls } = stubFetch([
      ['idx=prngof', NATURE],
      ['PRG_gugik_wyszukiwarka/MapServer/0/query', { features: [{ attributes: { teryt: '2012032' } }] }],
      ['/api/dict/jednostki', { '201203': { voivodeship: 'podlaskie', county: 'suwalski', commune: 'Przerośl' } }],
    ]);
    const hits = await search('hańcza', signal());
    expect(hits.map((h) => [h.kind, h.label, h.detail])).toEqual([
      ['nature', 'Hańcza', 'jezioro · gm. Przerośl, woj. podlaskie'],
      ['nature', 'Czarna Hańcza', 'rzeka'],
    ]);
    // A river is a series of points along its course, without one municipality.
    expect(hits[1].wkt).toMatch(/^MULTIPOINT\(\(\d+(\.\d+)? \d+(\.\d+)?\),/);
    expect(calls.filter((c) => c.includes('MapServer/0/query'))).toHaveLength(1);
  });

  it('draws a unit boundary from PRG rings and refuses odd codes', async () => {
    const { calls } = stubFetch([
      [
        'MapServer/1/query',
        {
          features: [
            {
              geometry: {
                rings: [
                  [
                    [0, 0],
                    [10, 0],
                    [10, 10],
                    [0, 0],
                  ],
                  [
                    [20, 20],
                    [30, 20],
                    [30, 30],
                    [20, 20],
                  ],
                ],
              },
            },
          ],
        },
      ],
    ]);
    expect(await unitOutline({ level: 'pow', teryt: '1417', name: 'otwocki' }, signal())).toBe(
      'POLYGON((0 0,10 0,10 10,0 0),(20 20,30 20,30 30,20 20))',
    );
    expect(new URL(calls[0]).searchParams.get('where')).toBe("teryt='1417'");
    expect(await unitOutline({ level: 'pow', teryt: "1' or '1'='1", name: 'x' }, signal())).toBeUndefined();
    expect(calls).toHaveLength(1);
  });
});

describe('placeOutline', () => {
  const hit = { kind: 'place' as const, label: 'Otwock', center: [656860, 474612] as [number, number] };

  it('returns the municipal boundary for a town that is its own municipality', async () => {
    stubFetch([['GetCommuneByXY', '0\nOtwock (miasto)|SRID=2180;MULTIPOLYGON(((1 1,2 2,3 3,1 1)))']]);
    expect(await placeOutline(hit, signal())).toBe('MULTIPOLYGON(((1 1,2 2,3 3,1 1)))');
  });

  it('falls back to the precinct of the same name, and to nothing', async () => {
    stubFetch([
      ['GetCommuneByXY', '0\nWiązowna|SRID=2180;POLYGON((0 0,1 0,1 1,0 0))'],
      ['GetRegionByXY', '0\nOtwock Mały|SRID=2180;POLYGON((5 5,6 5,6 6,5 5))'],
    ]);
    expect(await placeOutline(hit, signal())).toBe('POLYGON((5 5,6 5,6 6,5 5))');
    stubFetch([
      ['GetCommuneByXY', '0\nWiązowna|x'],
      ['GetRegionByXY', '0\nInny|y'],
    ]);
    expect(await placeOutline(hit, signal())).toBeUndefined();
    expect(await placeOutline({ ...hit, center: undefined }, signal())).toBeUndefined();
  });
});

describe('buildingAt', () => {
  it('returns the building outline or nothing', async () => {
    stubFetch([['GetBuildingByXY', '0\nSRID=2180;POLYGON((0 0,1 0,1 1,0 0))']]);
    expect(await buildingAt([1, 2], signal())).toBe('POLYGON((0 0,1 0,1 1,0 0))');
    stubFetch([['GetBuildingByXY', '-1 brak wyników']]);
    expect(await buildingAt([1, 2], signal())).toBeUndefined();
  });
});
