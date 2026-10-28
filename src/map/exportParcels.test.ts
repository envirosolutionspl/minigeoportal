import { describe, expect, it } from 'vitest';
import WKT from 'ol/format/WKT';
import { exportParcels, type ExportedParcel } from './exportParcels';

const parcel: ExportedParcel = {
  parcel: {
    id: '141201_1.0001.1867/2',
    voivodeship: 'mazowieckie',
    county: 'powiat miński',
    commune: 'Mińsk Mazowiecki (miasto)',
    region: 'Mińsk Mazowiecki',
    number: '1867/2',
    wkt: '',
  },
  geometry: new WKT().readGeometry('POLYGON((675000 482000,675100 482000,675100 482100,675000 482100,675000 482000))'),
  area: 10012.34,
};

describe('exportParcels', () => {
  it('writes GeoJSON in WGS 84 with the parcel data and its area', () => {
    const json = JSON.parse(exportParcels([parcel], 'geojson'));
    const [feature] = json.features;
    expect(feature.properties).toMatchObject({ identyfikator: '141201_1.0001.1867/2', numer: '1867/2', pole_m2: 10012, pole_ha: 1.0012 });
    const [lon, lat] = feature.geometry.coordinates[0][0];
    expect(lon).toBeCloseTo(21.58, 1);
    expect(lat).toBeCloseTo(52.18, 1);
  });

  it('writes KML named by the parcel ids', () => {
    const kml = exportParcels([parcel], 'kml');
    expect(kml).toContain('<name>141201_1.0001.1867/2</name>');
    expect(kml).toContain('<coordinates>');
  });

  it('writes CSV for a Polish spreadsheet: semicolons, decimal commas, UTF-8 mark, the outline as WKT in the map system', () => {
    const [head, row] = exportParcels([parcel], 'csv').replace('\uFEFF', '').split('\r\n');
    expect(head).toBe('identyfikator;numer;obreb;gmina;powiat;wojewodztwo;pole_m2;pole_ha;wkt_EPSG_2180');
    expect(
      row.startsWith(
        '141201_1.0001.1867/2;1867/2;Mińsk Mazowiecki;Mińsk Mazowiecki (miasto);powiat miński;mazowieckie;10012;1,0012;POLYGON((675000 482000,',
      ),
    ).toBe(true);
    expect(exportParcels([parcel], 'csv').startsWith('\uFEFF')).toBe(true);
  });
});
