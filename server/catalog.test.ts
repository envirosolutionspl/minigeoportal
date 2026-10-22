import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Upstream hosts resolve to a public address, so the address check lets them through.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '203.0.113.10', family: 4 }]) }));
import type { GeoportalConfig } from './geoportalConfig.ts';

let dir: string;
let mod: typeof import('./catalog.ts');
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'catalog-'));
  process.env.CATALOG_FILE = join(dir, 'catalog.json');
  mod = await import('./catalog.ts');
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const config = (): GeoportalConfig => ({
  services: new Map(
    [
      { id: 'groupPlan', label: 'Pomocnicze dane planistyczne', type: 'group', children: ['msMPZP', 'msStudium'] },
      { id: 'groupInne', label: 'Dane innych instytucji', type: 'group', children: ['groupNID'] },
      { id: 'groupNID', label: 'Narodowy Instytut Dziedzictwa', type: 'group', children: ['msZabytki'] },
      { id: 'msMPZP', label: 'Miejscowe plany', type: 'wms', url: 'https://gugik.example/mpzp' },
      { id: 'msStudium', label: 'Studium', type: 'wms', url: 'https://gugik.example/studium' },
      { id: 'msZabytki', label: 'Rejestr zabytków', type: 'wms', url: 'https://nid.example/wms' },
      { id: 'msCLC', label: 'Corine Land Cover 2018', type: 'wms', url: 'https://gios.example/clc' },
      { id: 'msRest', label: 'Wizualizacja BDOT10k', type: 'tiled', url: 'https://gugik.example/rest' },
      { id: 'msBase', label: '', type: 'basemap', url: 'https://gugik.example/blank' },
      { id: 'msDead', label: 'Nieużywana', type: 'wms', url: 'https://gugik.example/dead' },
    ].map((s) => [s.id, s]),
  ),
  modules: [
    { id: 'modulOS', label: 'Ochrona środowiska', layers: ['msCLC', 'msZabytki'] },
    { id: 'modulGK', label: 'Geoportal Krajowy', layers: ['groupPlan', 'msRest', 'groupInne', 'msBase'] },
  ],
});

describe('topicOf', () => {
  it('sorts layers into topics by their names and groups, specific topics first', () => {
    expect(mod.topicOf('Skala 1:10 000_1965', ['Dane archiwalne', 'Topografia'])).toBe('archiwalne');
    expect(mod.topicOf('Mapa zagrożenia powodziowego', ['Wody Polskie'])).toBe('zagrozenia');
    expect(mod.topicOf('INSPIRE: Rejestr zabytków nieruchomych', [])).toBe('zabytki');
    expect(mod.topicOf('Średnia cena za 1 m2 lokali mieszkalnych', ['GUS'])).toBe('ceny');
    expect(mod.topicOf('Obszary objęte planami ogólnymi gmin', ['Rejestr Urbanistyczny'])).toBe('planowanie');
    expect(mod.topicOf('Osnowa szczegółowa', ['Specjalistyczne informacje geodezyjne'])).toBe('geodezja');
    expect(mod.topicOf('Defibrylatory', ['Obiekty użyteczności publicznej'])).toBe('inne');
  });
});

describe('catalogEntries', () => {
  it('lists every layer some module shows once, main module first, with groups, order and our own entries', () => {
    const entries = mod.catalogEntries(config());
    expect(entries.map((e) => e.id)).toEqual(['msMPZP', 'msStudium', 'msRest', 'msZabytki', 'msCLC']);
    const mpzp = entries[0];
    expect(mpzp).toMatchObject({ path: ['Pomocnicze dane planistyczne'], modules: ['Geoportal Krajowy'], topic: 'planowanie', kind: 'wms', order: 0, curated: 'kimpzp' });
    const zabytki = entries.find((e) => e.id === 'msZabytki')!;
    expect(zabytki.path).toEqual(['Dane innych instytucji', 'Narodowy Instytut Dziedzictwa']);
    expect(zabytki.modules).toEqual(['Geoportal Krajowy', 'Ochrona środowiska']);
    expect(entries.find((e) => e.id === 'msRest')?.kind).toBe('rest');
  });

  it('lists a layer defined twice under different ids once', () => {
    const twice = config();
    twice.services.set('msZabytki2', { id: 'msZabytki2', label: 'Rejestr zabytków', type: 'wms', url: 'https://nid.example/wms?' });
    twice.modules.push({ id: 'modulTur', label: 'Turystyka', layers: ['msZabytki2'] });
    const entries = mod.catalogEntries(twice);
    expect(entries.filter((e) => e.title === 'Rejestr zabytków')).toHaveLength(1);
    expect(entries.find((e) => e.id === 'msZabytki')?.modules).toEqual(['Geoportal Krajowy', 'Ochrona środowiska', 'Turystyka']);
  });

  it('lists the same name on the same service once, with or without a sublayer', () => {
    const twice = config();
    twice.services.set('msZabytkiNieruchome', { id: 'msZabytkiNieruchome', label: 'Rejestr Zabytków', type: 'wms', url: 'https://nid.example/wms', sublayers: [{ name: 'nieruchome', title: 'Nieruchome' }] });
    twice.modules.push({ id: 'modulTur', label: 'Turystyka', layers: ['msZabytkiNieruchome'] });
    const entries = mod.catalogEntries(twice);
    expect(entries.filter((e) => e.url === 'https://nid.example/wms').map((e) => e.id)).toEqual(['msZabytki']);
  });
});

describe('failureStatus', () => {
  it('tells tokens, refusals and silence apart', () => {
    expect(mod.failureStatus(new Error('HTTP 499'))).toEqual({ status: 'token', detail: 'HTTP 499: Token Required' });
    expect(mod.failureStatus(new Error('HTTP 403'))).toEqual({ status: 'refused', detail: 'HTTP 403' });
    const cert = Object.assign(new TypeError('fetch failed'), { cause: { code: 'CERT_HAS_EXPIRED' } });
    expect(mod.failureStatus(cert)).toEqual({ status: 'down', detail: 'CERT_HAS_EXPIRED' });
    expect(mod.failureStatus(new Error('Unsupported: EPSG:3857'))).toEqual({ status: 'unsupported', detail: 'EPSG:3857' });
  });
});

const CAPS = (layer: string) =>
  `<WMS_Capabilities><Service><Title>T</Title></Service><Capability><Request><GetFeatureInfo><Format>text/html</Format></GetFeatureInfo></Request><Layer><Name>${layer}</Name><Title>${layer}</Title></Layer></Capability></WMS_Capabilities>`;

describe('buildCatalog', () => {
  it('checks each service once, keeps the last metadata of a server that stopped answering, and the whole catalog when the configuration is gone', async () => {
    const geo = await import('./geoportalConfig.ts');
    const spy = vi.spyOn(geo, 'fetchGeoportalConfig').mockResolvedValue(config());
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.startsWith('https://gios.example')) return new Response('no', { status: 403 });
        if (url.startsWith('https://gugik.example/rest')) return new Response('<h1>Unauthorized.</h1><p>Token Require</p>', { status: 401 });
        return new Response(CAPS(url.includes('nid') ? 'zabytki' : 'plany'));
      }),
    );
    const log = vi.fn();
    const first = await mod.buildCatalog(undefined, log);
    expect(first.entries.map((e) => [e.id, e.status])).toEqual([
      ['msMPZP', 'ok'],
      ['msStudium', 'ok'],
      ['msRest', 'token'],
      ['msZabytki', 'ok'],
      ['msCLC', 'refused'],
    ]);
    expect(first.entries.find((e) => e.id === 'msCLC')?.detail).toBe('HTTP 403');
    expect(first.services['https://nid.example/wms'].meta).toMatchObject({ layers: { zabytki: {} } });
    expect(calls.filter((u) => u.includes('GetCapabilities'))).toHaveLength(4);

    // The heritage server goes silent: still listed, marked down, metadata kept for when it returns.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.startsWith('https://nid.example') ? Promise.reject(new Error('timeout')) : new Response(CAPS('plany')))));
    const second = await mod.buildCatalog(first, log);
    expect(second.entries.find((e) => e.id === 'msZabytki')?.status).toBe('down');
    expect(second.services['https://nid.example/wms'].meta).toMatchObject({ layers: { zabytki: {} } });

    // The geoportal drops a layer and adds one: the catalog follows.
    const changed = config();
    changed.modules[1].layers = ['groupPlan'];
    changed.services.set('groupPlan', { id: 'groupPlan', label: 'Pomocnicze dane planistyczne', type: 'group', children: ['msMPZP', 'msPOG'] });
    changed.services.set('msPOG', { id: 'msPOG', label: 'Plany ogólne', type: 'wms', url: 'https://gugik.example/pog' });
    spy.mockResolvedValue(changed);
    const third = await mod.buildCatalog(second, log);
    // Heritage is now only in the environment module, which lists Corine before it.
    expect(third.entries.map((e) => e.id)).toEqual(['msMPZP', 'msPOG', 'msCLC', 'msZabytki']);
    expect(log).toHaveBeenLastCalledWith('catalog: 4 layers (1 added, 2 removed)');

    spy.mockRejectedValue(new Error('HTTP 404'));
    expect(await mod.buildCatalog(third, log)).toBe(third);
    await expect(mod.buildCatalog(undefined, log)).rejects.toThrow('HTTP 404');
    spy.mockRestore();
  });

  it('writes the catalog atomically and reads it back; the index leaves out what loads per layer', async () => {
    const catalog = {
      generatedAt: 'x',
      entries: [{ id: 'a', title: 'A', path: [], modules: ['M'], topic: 'inne' as const, kind: 'wms' as const, url: 'https://a', order: 0, status: 'ok' as const, checked: 'x', sublayers: [{ name: 'n', title: 't' }] }],
      services: {},
    };
    await mod.writeCatalog(catalog);
    expect(await mod.readCatalog()).toEqual(catalog);
    expect(mod.catalogIndex(catalog).entries[0]).toEqual({ id: 'a', title: 'A', path: [], topic: 'inne', kind: 'wms', order: 0, status: 'ok', checked: 'x' });
  });
});
