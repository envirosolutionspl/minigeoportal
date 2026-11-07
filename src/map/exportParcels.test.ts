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
const note = /nie odpowiada powierzchni ewidencyjnej/;

describe('exportParcels', () => {
  it('writes GeoJSON in WGS 84 with the parcel data, its area and what the area is', () => {
    const json = JSON.parse(exportParcels([parcel], 'geojson'));
    const [feature] = json.features;
    expect(feature.properties).toMatchObject({ identyfikator: '141201_1.0001.1867/2', numer: '1867/2', pole_m2: 10012, pole_ha: 1.0012 });
    expect(feature.properties.pole_uwagi).toMatch(note);
    const [lon, lat] = feature.geometry.coordinates[0][0];
    expect(lon).toBeCloseTo(21.58, 1);
    expect(lat).toBeCloseTo(52.18, 1);
  });

  it('writes KML named by the parcel ids, saying what the area is', () => {
    const kml = exportParcels([parcel], 'kml');
    expect(kml).toContain('<name>141201_1.0001.1867/2</name>');
    expect(kml).toContain('<coordinates>');
    expect(kml).toMatch(/<Data name="pole_uwagi"><value>[^<]*nie odpowiada powierzchni ewidencyjnej/);
  });

  it('writes CSV for a Polish spreadsheet: semicolons, decimal commas, UTF-8 mark, what the area is, the outline as WKT in the map system', () => {
    const [head, row] = exportParcels([parcel], 'csv').replace('﻿', '').split('\r\n');
    expect(head).toBe('identyfikator;obreb;gmina;powiat;wojewodztwo;pole_m2;pole_ha;pole_uwagi;wkt_EPSG_2180');
    expect(
      row.startsWith('141201_1.0001.1867/2;Mińsk Mazowiecki;Mińsk Mazowiecki (miasto);powiat miński;mazowieckie;10012;1,0012;Powierzchnia'),
    ).toBe(true);
    expect(row.split(';')[7]).toMatch(note);
    expect(row).toContain(';POLYGON((675000 482000,');
    expect(exportParcels([parcel], 'csv').startsWith('﻿')).toBe(true);
  });

  it('leaves out of CSV the bare parcel number, which Excel would turn into a date (22/1 as 22 January)', () => {
    const csv = exportParcels([{ ...parcel, parcel: { ...parcel.parcel, id: '141201_1.0001.22/1', number: '22/1' } }], 'csv');
    const [, row] = csv.split('\r\n');
    expect(row.split(';')).not.toContain('22/1');
    expect(row.startsWith('141201_1.0001.22/1;')).toBe(true);
  });
});
