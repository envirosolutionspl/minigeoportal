import { describe, expect, it } from 'vitest';
import { arrayItems, parseModule, parsePrefixes, parseServices, partNames } from './geoportalConfig.ts';

/** The shape of the geoportal.gov.pl configuration, with the traps it really has. */
const PART = `export const config = {
  services: [
    {
      id: 'groupPlanowanie',
      //label: 'Planowanie i zagospodarowanie przestrzenne',
      label: 'Pomocnicze dane planistyczne',
      type: 'group',
      layers: [
        //{
        //  layerId: 'msBudynkiBDOT10k',
        //},
        { layerId: 'msMPZP', visible: false },
      ],
    },
    {
      id: 'msMPZP',
      label: 'Miejscowe plany',
      type: 'wms',
      url: 'https://mapy.geoportal.gov.pl/wss/ext/KIMPZP',
      params: { featureInfoFormat: 'text/xml', note: 'a } brace and a ] bracket in a string' },
      sublayers: [
        { name: 'raster', title: 'Plany rastrowe', visible: true },
        { name: 'wektor', title: 'Plany wektorowe' },
      ],
      opacity: 0.8,
    },
    /* { id: 'msOld', type: 'wms', url: 'https://old' }, */
    { id: 'msPodkl', label: 'Podkład', type: 'tiled', url: '\${msPodkl}' },
    { id: 'msHttp', label: 'Bez https', type: 'wms', url: 'http://example.com/wms' },
  ],
  gpmaps: [
    {
      id: 'modulPP',
      label: 'Planowanie Przestrzenne',
      basemaps: [{ layerId: 'msTLO' }],
      layers: [
        { layerId: 'groupPlanowanie', visible: false },
        { layerId: 'msPodkl', visible: true },
      ],
    },
  ],
};`;

describe('geoportal configuration parser', () => {
  it('splits arrays into their top-level objects, respecting strings', () => {
    const code = "[{ a: '}' }, { b: [1, { c: 2 }] }]";
    expect(arrayItems(code, 0)).toEqual(["{ a: '}' }", '{ b: [1, { c: 2 }] }']);
  });

  it('reads services, groups, sublayers and formats, skipping comments and plain-http addresses', () => {
    const services = parseServices(PART, { msPodkl: 'https://mapy.geoportal.gov.pl/gprest/services/G2/MapServer' });
    const byId = Object.fromEntries(services.map((s) => [s.id, s]));
    expect(Object.keys(byId)).toEqual(['groupPlanowanie', 'msMPZP', 'msPodkl', 'msHttp']);
    expect(byId.groupPlanowanie).toEqual({ id: 'groupPlanowanie', label: 'Pomocnicze dane planistyczne', type: 'group', children: ['msMPZP'] });
    expect(byId.msMPZP).toMatchObject({
      type: 'wms',
      url: 'https://mapy.geoportal.gov.pl/wss/ext/KIMPZP',
      featureInfoFormat: 'text/xml',
      sublayers: [
        { name: 'raster', title: 'Plany rastrowe' },
        { name: 'wektor', title: 'Plany wektorowe' },
      ],
    });
    expect(byId.msPodkl.url).toBe('https://mapy.geoportal.gov.pl/gprest/services/G2/MapServer');
    expect(byId.msHttp.url).toBeUndefined();
  });

  it('reads the module with its top-level layer list, not the base maps', () => {
    expect(parseModule(PART)).toEqual({ id: 'modulPP', label: 'Planowanie Przestrzenne', layers: ['groupPlanowanie', 'msPodkl'] });
    expect(parseModule('export const config = {};')).toBeUndefined();
  });

  it('finds the parts and the address prefixes', () => {
    expect(partNames("import('./config_parts/part_GK.js'); load('config_parts/part_GK.js', 'config_parts/part_IoT.js')")).toEqual([
      'config_parts/part_GK.js',
      'config_parts/part_IoT.js',
    ]);
    expect(parsePrefixes("prefixes: { msPodkl: 'https://a/MapServer', // x\n other: 1 }")).toEqual({ msPodkl: 'https://a/MapServer' });
  });
});
