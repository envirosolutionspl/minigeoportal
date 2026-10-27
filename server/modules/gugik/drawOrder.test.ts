import { describe, expect, it } from 'vitest';
import { geoportalLayerOrder, overlayOrder } from './drawOrder.ts';
import { defaults } from '../../testSite.ts';

/** Shape of the geoportal.gov.pl configuration: services with groups, then the map's layer list. */
const CONFIG = `export const config = {
  services: [
    {
      id: 'groupPlanowanie',
      type: 'group',
      layers: [
        //{
        //  layerId: 'msBudynkiBDOT10k',
        //},
        { layerId: 'groupDaneArch' },
        { layerId: 'msSUiKZP', visible: false },
        { layerId: 'msMPZP', visible: false },
        { layerId: 'msPlanyOgolneGmin', visible: false },
      ],
    },
    {
      id: 'msPOGP',
      url: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/PodstawowaOsnowaGeodezyjnaPozioma',
    },
  ],
  gpmaps: [
    {
      id: 'modulGK',
      basemap: 'msBDOO_BDOT10k_base',
      basemaps: [{ layerId: 'msBDOO_BDOT10k_base' }],
      layers: [
        { layerId: 'groupPlanowanie', visible: false },
        /* { layerId: 'msOld' }, */
        { layerId: 'msKIBDOT', visible: true },
        { layerId: 'msKIUT', visible: true },
        { layerId: 'msKIEG', visible: true },
        { layerId: 'msRejestrCenNieruchomosci', visible: false },
        { layerId: 'msAdresyUlice', visible: false },
        { layerId: 'msPRG', visible: false },
      ],
    },
  ],
};`;

/** The main file of the configuration, read after the map's: the groups the maps share. */
const MAIN = `export const main = {
  services: [
    { id: 'groupDaneArch', type: 'group', layers: [{ layerId: 'msTOPO_SERIA_10_1992' }, { layerId: 'msORTO_TIME_WMS' }] },
  ],
};`;

describe('geoportalLayerOrder', () => {
  it('lists the map layers bottom to top with groups expanded and comments ignored', () => {
    expect(
      geoportalLayerOrder(`${CONFIG}
${MAIN}`),
    ).toEqual([
      'msBDOO_BDOT10k_base',
      'msTOPO_SERIA_10_1992',
      'msORTO_TIME_WMS',
      'msSUiKZP',
      'msMPZP',
      'msPlanyOgolneGmin',
      'msKIBDOT',
      'msKIUT',
      'msKIEG',
      'msRejestrCenNieruchomosci',
      'msAdresyUlice',
      'msPRG',
    ]);
    expect(geoportalLayerOrder('not a config')).toEqual([]);
  });
});

describe('overlayOrder', () => {
  it('orders our overlays as the geoportal draws them', () => {
    expect(
      overlayOrder(
        `${CONFIG}
${MAIN}`,
        defaults.layers.overlays,
      ),
    ).toEqual(['mapy-dawne', 'orto-archiwalna', 'suikzp', 'kimpzp', 'pog', 'kibdot', 'kiut', 'kieg', 'rcn', 'kina', 'prg']);
  });

  it('follows a changed order', () => {
    const swapped = CONFIG.replace(
      "{ layerId: 'msKIUT', visible: true },\n        { layerId: 'msKIEG', visible: true },",
      "{ layerId: 'msKIEG', visible: true },\n        { layerId: 'msKIUT', visible: true },",
    );
    expect(
      overlayOrder(
        `${swapped}
${MAIN}`,
        defaults.layers.overlays,
      ),
    ).toEqual(['mapy-dawne', 'orto-archiwalna', 'suikzp', 'kimpzp', 'pog', 'kibdot', 'kieg', 'kiut', 'rcn', 'kina', 'prg']);
  });

  it('gives up when an overlay is missing, so the built-in order is used', () => {
    expect(overlayOrder(CONFIG.replace("{ layerId: 'msKIUT', visible: true },", ''), defaults.layers.overlays)).toBeUndefined();
  });
});
