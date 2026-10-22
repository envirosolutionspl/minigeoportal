/**
 * Parcel report of geoportal.gov.pl for the parcel at a point: land register data, plans,
 * terrain and more, with a PDF export. It takes PL-1992 X (northing) and Y (easting).
 */
export function parcelReportUrl([easting, northing]: [number, number]): string {
  const params = new URLSearchParams({ x: northing.toFixed(2), y: easting.toFixed(2) });
  return `https://mapy.geoportal.gov.pl/imap/parcelInfo/index3_a.html?${params}`;
}
