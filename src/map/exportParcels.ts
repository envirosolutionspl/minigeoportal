import Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import KML from 'ol/format/KML';
import WKT from 'ol/format/WKT';
import type { Geometry } from 'ol/geom';
import type { Parcel } from '@/modules';
import { PROJECTION } from './projection';

/** A parcel of the selection as it is exported: its data, outline and area from the geometry. */
export interface ExportedParcel {
  parcel: Parcel;
  geometry: Geometry;
  /** Square metres. */
  area: number;
}

export type ExportFormat = 'geojson' | 'kml' | 'csv';

/** Attributes as GIS programs show them: the parcel's units and number, the area in m² and ha. */
const properties = ({ parcel, area }: ExportedParcel) => ({
  identyfikator: parcel.id,
  numer: parcel.number,
  obreb: parcel.region,
  gmina: parcel.commune,
  powiat: parcel.county,
  wojewodztwo: parcel.voivodeship,
  pole_m2: Math.round(area),
  pole_ha: Number((area / 10000).toFixed(4)),
});

const features = (parcels: ExportedParcel[]) =>
  parcels.map((p) => new Feature({ ...properties(p), name: p.parcel.id, geometry: p.geometry.clone() }));

/** A CSV value; a semicolon, quote or line break needs quotes. */
const cell = (value: string | number) => {
  const text = String(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * The selected parcels as a file: GeoJSON in WGS 84 (as RFC 7946 asks), KML for Google Earth, CSV
 * for a spreadsheet, with semicolons and decimal commas as Polish Excel reads them and the outline
 * as WKT in the map's system.
 */
export function exportParcels(parcels: ExportedParcel[], format: ExportFormat): string {
  const options = { dataProjection: 'EPSG:4326', featureProjection: PROJECTION };
  if (format === 'geojson') return new GeoJSON().writeFeatures(features(parcels), { ...options, decimals: 7 });
  if (format === 'kml') return new KML().writeFeatures(features(parcels), options);
  const wkt = new WKT();
  const head = [
    'identyfikator',
    'numer',
    'obreb',
    'gmina',
    'powiat',
    'wojewodztwo',
    'pole_m2',
    'pole_ha',
    `wkt_${PROJECTION.getCode().replace(':', '_')}`,
  ];
  const rows = parcels.map((p) => {
    const a = properties(p);
    return [
      a.identyfikator,
      a.numer,
      a.obreb,
      a.gmina,
      a.powiat,
      a.wojewodztwo,
      a.pole_m2,
      a.pole_ha.toFixed(4).replace('.', ','),
      wkt.writeGeometry(p.geometry, { decimals: 2 }),
    ];
  });
  // The byte order mark tells Excel the file is UTF-8, so Polish letters show.
  return '\uFEFF' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

const TYPES: Record<ExportFormat, string> = {
  geojson: 'application/geo+json',
  kml: 'application/vnd.google-earth.kml+xml',
  csv: 'text/csv;charset=utf-8',
};

/** Saves the export as a file named after the day, e.g. dzialki-2026-10-28.csv. */
export function downloadParcels(parcels: ExportedParcel[], format: ExportFormat): void {
  const url = URL.createObjectURL(new Blob([exportParcels(parcels, format)], { type: TYPES[format] }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `dzialki-${new Date().toISOString().slice(0, 10)}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}
