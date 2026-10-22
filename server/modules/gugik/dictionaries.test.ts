import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestError } from '../../http.ts';

// The cache directory is read when the module loads, so it is set before the import.
let dir: string;
let dict: typeof import('./dictionaries.ts');
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dict-'));
  process.env.DICT_CACHE_DIR = dir;
  dict = await import('./dictionaries.ts');
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const prgRows = (rows: [string, string][]) => ({ features: rows.map(([teryt, nazwa]) => ({ attributes: { teryt, nazwa } })) });

/** Upstream stub keyed by substring of the URL; unmatched URLs fail like a dead server. */
function stubUpstream(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      const key = Object.keys(routes).find((k) => url.includes(k));
      return key ? routes[key]() : new Response('down', { status: 503 });
    }),
  );
  return calls;
}
const json = (body: unknown) => () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const text = (body: string) => () => new Response(body);

const VOIVODESHIPS = json(
  prgRows([
    ['14', 'mazowieckie'],
    ['12', 'małopolskie'],
  ]),
);
const COUNTIES_14 = json(
  prgRows([
    ['1417', 'otwocki'],
    ['1465', 'Warszawa'],
  ]),
);

beforeEach(() => stubUpstream({ '/2/query': VOIVODESHIPS, '/1/query': COUNTIES_14 }));

describe('validation against parent lists', () => {
  it('sorts voivodeships by name', async () => {
    expect((await dict.voivodeships()).map((e) => e.name)).toEqual(['małopolskie', 'mazowieckie']);
  });

  it.each([
    ['counties', 'x1', 'Invalid voivodeship'],
    ['counties', '99', 'Unknown voivodeship'],
    ['communes', '9999', 'Unknown voivodeship'],
    ['communes', '1499', 'Unknown county'],
    ['precincts', '149900_1', 'Unknown county'],
    ['precincts', 'abc', 'Invalid municipality'],
    // Codes go into the ArcGIS where clause, so anything but digits is refused first.
    ['counties', "14' OR '1'='1", 'Invalid voivodeship'],
    ['communes', "14%' --", 'Invalid county'],
  ] as const)('%s(%s) is refused with "%s" and never reaches upstream', async (fn, code, message) => {
    const calls = stubUpstream({ '/2/query': VOIVODESHIPS, '/1/query': COUNTIES_14 });
    await expect(dict[fn](code)).rejects.toThrow(new RequestError(message));
    expect(calls.some((u) => u.includes('uldk') || u.includes('/0/query'))).toBe(false);
  });
});

describe('communes', () => {
  it('converts PRG codes to ULDK unit ids and expands cities with districts', async () => {
    stubUpstream({
      '/2/query': VOIVODESHIPS,
      '/1/query': COUNTIES_14,
      '/0/query': json(prgRows([['1465011', 'Warszawa']])),
    });
    const warsaw = await dict.communes('1465');
    expect(warsaw).toHaveLength(18);
    expect(warsaw[0]).toEqual({ id: '146502_8', name: 'Warszawa-Bemowo' });

    stubUpstream({
      '/2/query': VOIVODESHIPS,
      '/1/query': COUNTIES_14,
      '/0/query': json(
        prgRows([
          ['1417082', 'Wiązowna'],
          ['1417021', 'Otwock'],
        ]),
      ),
    });
    expect(await dict.communes('1417')).toEqual([
      { id: '141702_1', name: 'Otwock' },
      { id: '141708_2', name: 'Wiązowna' },
    ]);
  });
});

describe('precincts', () => {
  it('parses ULDK rows, keeps only precinct ids and sorts numerically', async () => {
    stubUpstream({
      '/2/query': VOIVODESHIPS,
      '/1/query': COUNTIES_14,
      '/0/query': json(prgRows([['1417082', 'Wiązowna']])),
      'uldk.gugik.gov.pl': text('0\n141708_2.0021|Wiązowna Gminna\n141708_2.0010|10\n141708_2.0002|2\ngarbage|x\n'),
    });
    expect(await dict.precincts('141708_2')).toEqual([
      { id: '141708_2.0002', name: '2' },
      { id: '141708_2.0010', name: '10' },
      { id: '141708_2.0021', name: 'Wiązowna Gminna' },
    ]);
  });

  it('serves the stale copy when ULDK fails, and does not write empty answers to disk', async () => {
    // First: cached by the previous test. ULDK now fails: the list still comes back.
    stubUpstream({
      '/2/query': VOIVODESHIPS,
      '/1/query': COUNTIES_14,
      '/0/query': json(
        prgRows([
          ['1417082', 'Wiązowna'],
          ['1417021', 'Otwock'],
        ]),
      ),
    });
    expect((await dict.precincts('141708_2')).length).toBe(3);

    stubUpstream({
      '/2/query': VOIVODESHIPS,
      '/1/query': COUNTIES_14,
      '/0/query': json(
        prgRows([
          ['1417082', 'Wiązowna'],
          ['1417021', 'Otwock'],
        ]),
      ),
      'uldk.gugik.gov.pl': text('-1 brak wyników'),
    });
    expect(await dict.precincts('141702_1')).toEqual([]);
    const files = await readdir(dir);
    expect(files).toContain('obr-141708_2.json');
    expect(files).not.toContain('obr-141702_1.json');
  });
});

describe('unitNames', () => {
  it('names the units of municipality codes and skips unknown ones', async () => {
    stubUpstream({
      '/2/query': VOIVODESHIPS,
      '/1/query': COUNTIES_14,
      '/0/query': json(
        prgRows([
          ['1417082', 'Wiązowna'],
          ['1417021', 'Otwock'],
        ]),
      ),
    });
    const names = await dict.unitNames(['141708', '141702', '141708', '999999']);
    expect(names).toEqual({
      '141708': { voivodeship: 'mazowieckie', county: 'otwocki', commune: 'Wiązowna' },
      '141702': { voivodeship: 'mazowieckie', county: 'otwocki', commune: 'Otwock' },
    });
  });

  it('leaves out the municipality for a city listed by districts', async () => {
    stubUpstream({ '/2/query': VOIVODESHIPS, '/1/query': COUNTIES_14, '/0/query': json(prgRows([['1465011', 'Warszawa']])) });
    expect(await dict.unitNames(['146501'])).toEqual({ '146501': { voivodeship: 'mazowieckie', county: 'Warszawa' } });
  });

  it('rejects malformed codes and too many codes', async () => {
    await expect(dict.unitNames(['14170'])).rejects.toThrow(new RequestError('Invalid TERYT codes'));
    await expect(dict.unitNames(Array.from({ length: 21 }, (_, i) => String(100000 + i)))).rejects.toThrow(RequestError);
  });
});

describe('PRG paging', () => {
  it('follows pages until a short one and stops at the page limit', async () => {
    const full = prgRows(Array.from({ length: 1000 }, (_, i) => [`12${String(i).padStart(2, '0')}`, `p${i}`] as [string, string]));
    let pages = 0;
    stubUpstream({
      '/2/query': VOIVODESHIPS,
      '/1/query': () => {
        pages++;
        return new Response(JSON.stringify(full), { headers: { 'content-type': 'application/json' } });
      },
    });
    const counties = await dict.counties('12');
    expect(pages).toBe(5);
    expect(counties).toHaveLength(5000);
  });
});

describe('findUnits', () => {
  const ALL_COUNTIES = json(
    prgRows([
      ['1417', 'otwocki'],
      ['1261', 'Kraków'],
      ['1206', 'krakowski'],
    ]),
  );
  const ALL_COMMUNES = json(
    prgRows([
      ['1417082', 'Wiązowna'],
      ['1417011', 'Otwock'],
      ['1261011', 'Kraków'],
      ['1206032', 'Krzeszowice'],
    ]),
  );
  beforeEach(() => stubUpstream({ '/2/query': VOIVODESHIPS, '/1/query': ALL_COUNTIES, '/0/query': ALL_COMMUNES }));

  it('finds units of every level by the start of the name, exact names first', async () => {
    expect(await dict.findUnits('mazow')).toEqual([{ level: 'woj', teryt: '14', name: 'mazowieckie' }]);
    expect(await dict.findUnits('wiazowna')).toEqual([
      { level: 'gm', teryt: '1417082', name: 'Wiązowna', county: 'otwocki', voivodeship: 'mazowieckie' },
    ]);
    // The city county Kraków is also a municipality; only the county is listed.
    expect((await dict.findUnits('krak')).map((h) => [h.level, h.name])).toEqual([
      ['pow', 'krakowski'],
      ['pow', 'Kraków'],
    ]);
    expect((await dict.findUnits('kraków')).map((h) => h.name)).toEqual(['Kraków', 'krakowski']);
    expect((await dict.findUnits('otwock')).map((h) => [h.level, h.name])).toEqual([
      ['gm', 'Otwock'],
      ['pow', 'otwocki'],
    ]);
  });

  it('limits the level with a leading word and ignores odd input', async () => {
    expect((await dict.findUnits('powiat otw')).map((h) => h.name)).toEqual(['otwocki']);
    expect((await dict.findUnits('gm. otw')).map((h) => h.name)).toEqual(['Otwock']);
    expect(await dict.findUnits('w')).toEqual([]);
    expect(await dict.findUnits("o' or 1=1")).toEqual([]);
  });
});
