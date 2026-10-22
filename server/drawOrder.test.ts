import { describe, expect, it } from 'vitest';
import { geoportalLayerOrder, overlayOrder } from './drawOrder.ts';
import { defaults } from './testSite.ts';

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

describe('geoportalLayerOrder', () => {
  it('lists the map layers bottom to top with groups expanded and comments ignored', () => {
    expect(geoportalLayerOrder(CONFIG)).toEqual([
      'msBDOO_BDOT10k_base',
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
    expect(overlayOrder(CONFIG, defaults.layers.overlays)).toEqual([
      'suikzp',
      'kimpzp',
      'pog',
      'kibdot',
      'kiut',
      'kieg',
      'rcn',
      'kina',
      'prg',
    ]);
  });

  it('follows a changed order', () => {
    const swapped = CONFIG.replace(
      "{ layerId: 'msKIUT', visible: true },\n        { layerId: 'msKIEG', visible: true },",
      "{ layerId: 'msKIEG', visible: true },\n        { layerId: 'msKIUT', visible: true },",
    );
    expect(overlayOrder(swapped, defaults.layers.overlays)).toEqual([
      'suikzp',
      'kimpzp',
      'pog',
      'kibdot',
      'kieg',
      'kiut',
      'rcn',
      'kina',
      'prg',
    ]);
  });

  it('gives up when an overlay is missing, so the built-in order is used', () => {
    expect(overlayOrder(CONFIG.replace("{ layerId: 'msKIUT', visible: true },", ''), defaults.layers.overlays)).toBeUndefined();
  });
});
