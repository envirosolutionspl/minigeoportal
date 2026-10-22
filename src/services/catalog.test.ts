import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOG_ID, catalogSublayers, clearCatalog, loadCatalogLayer, overlayDef, useCatalog } from './catalog';
import { layerMeta } from './meta';
import { DRAW_ORDER, createOverlayLayer } from './layers';
import type { CatalogEntry } from './catalogTypes';
import { stubFetch, withCapabilities } from '@/test/helpers';

const ENTRY: CatalogEntry = {
  id: 'msZabytki',
  title: 'Rejestr zabytków',
  path: ['Dane innych instytucji', 'NID'],
  modules: ['Geoportal Krajowy'],
  topic: 'zabytki',
  kind: 'wms',
  url: 'https://nid.example/wms',
  order: 40,
  status: 'ok',
  checked: 'x',
};
const META = {
  kind: 'wms' as const,
  fetchedAt: 'x',
  title: 'NID',
  infoFormats: ['text/xml'],
  layers: { Root: { title: 'NID', queryable: false }, monuments: { title: 'Zabytki', queryable: true, maxScale: 50000 } },
};

beforeEach(async () => {
  clearCatalog();
  await withCapabilities();
});

describe('catalogSublayers', () => {
  it('takes the sublayers the geoportal names, or else the named layers below the root', () => {
    expect(catalogSublayers({ ...ENTRY, sublayers: [{ name: 'a', title: 'A' }] }, META)).toEqual([{ name: 'a', title: 'A', default: true }]);
    expect(catalogSublayers(ENTRY, META)).toEqual([{ name: 'monuments', title: 'Zabytki', default: true }]);
    expect(catalogSublayers(ENTRY, undefined)).toEqual([]);
  });
});

describe('loadCatalogLayer', () => {
  it('fetches a layer once, makes it an overlay and adds its metadata', async () => {
    const { calls } = stubFetch([['/api/catalog/msZabytki', { entry: ENTRY, meta: META }]]);
    const [a, b] = await Promise.all([loadCatalogLayer('msZabytki'), loadCatalogLayer('msZabytki')]);
    expect(a).toBe(b);
    expect(a).toMatchObject({ id: 'msZabytki', title: 'Rejestr zabytków', description: 'Dane innych instytucji › NID', topic: 'zabytki', url: 'https://nid.example/wms' });
    expect(calls).toEqual(['/api/catalog/msZabytki']);
    expect(overlayDef('msZabytki')).toBe(a);
    expect(layerMeta('msZabytki', 'monuments')?.maxScale).toBe(50000);
  });

  it('gives nothing for layers we cannot draw, unknown ids and odd ids', async () => {
    const { calls } = stubFetch([['/api/catalog/msCLC', { entry: { ...ENTRY, id: 'msCLC', status: 'refused' } }]]);
    expect(await loadCatalogLayer('msCLC')).toBeUndefined();
    expect(await loadCatalogLayer('msNope')).toBeUndefined();
    expect(await loadCatalogLayer('../api/x')).toBeUndefined();
    expect(calls).toEqual(['/api/catalog/msCLC', '/api/catalog/msNope']);
    expect(CATALOG_ID.test('msKIEG')).toBe(true);
    expect(CATALOG_ID.test('a b')).toBe(false);
  });

  it('prefers our own registry entry', async () => {
    expect((await loadCatalogLayer('kieg'))?.title).toBe('Ewidencja gruntów i budynków');
  });
});

describe('drawing order of catalog layers', () => {
  it('puts a catalog layer just above the highest of our layers that the geoportal draws below it', async () => {
    useCatalog.setState({
      byId: new Map(
        [
          { ...ENTRY, id: 'msMPZP', order: 10, curated: 'kimpzp' },
          { ...ENTRY, id: 'msKIEG', order: 30, curated: 'kieg' },
          { ...ENTRY, id: 'msPRG', order: 60, curated: 'prg' },
          ENTRY,
        ].map((e) => [e.id, e]),
      ),
    });
    stubFetch([['/api/catalog/msZabytki', { entry: ENTRY, meta: META }]]);
    const zabytki = createOverlayLayer((await loadCatalogLayer('msZabytki'))!);
    const z = (id: string) => 10 + DRAW_ORDER.indexOf(id);
    expect(zabytki.getZIndex()!).toBeGreaterThan(z('kieg'));
    expect(zabytki.getZIndex()!).toBeLessThan(z('rcn'));
  });
});
