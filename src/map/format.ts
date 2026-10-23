import { toLonLat } from 'ol/proj';
import { config } from '@/config/runtime';
import { PROJECTION } from './projection';

/** Number formats of the visitor's language for coordinates and measurements. */

const int = new Intl.NumberFormat(config.locale, { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat(config.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const two = new Intl.NumberFormat(config.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const four = new Intl.NumberFormat(config.locale, { maximumFractionDigits: 4 });

/** Scale denominator as shown to people: 1:10 000. */
export const scaleText = (scale: number) => `1:${int.format(scale)}`;

const day = new Intl.DateTimeFormat(config.locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
/** "2025-04-27" as the language writes dates: 27.04.2025 in Polish, 04/27/2025 in English. */
export const dateText = (iso: string) => day.format(new Date(`${iso}T00:00:00Z`));
const deg = new Intl.NumberFormat(config.locale, { minimumFractionDigits: 5, maximumFractionDigits: 5 });

const SYSTEM = config.map.projection.name;
/** In a north-east system (PL-1992) X is the northing, as surveyors write it; otherwise the easting. */
const NORTH_FIRST = config.map.projection.axisOrientation === 'neu';
const SYSTEM_HTML = SYSTEM.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const unit = PROJECTION.getUnits() === 'degrees' ? deg : int;

/**
 * A point in the map's system and in WGS 84. `coordinate` is the map coordinate [easting, northing].
 */
export function formatCoordinate(coordinate: number[]): string {
  const { x, y, lat, lon } = coordinateParts(coordinate);
  return `${SYSTEM} X ${x}, Y ${y} · ${lat} N, ${lon} E`;
}

function coordinateParts(coordinate: number[]) {
  const [e, n] = coordinate;
  const [lon, lat] = toLonLat(coordinate, PROJECTION);
  const [x, y] = NORTH_FIRST ? [n, e] : [e, n];
  return { x: unit.format(x), y: unit.format(y), lat: `${deg.format(lat)}°`, lon: `${deg.format(lon)}°` };
}

/**
 * The same point for the bar under the map, as markup for OpenLayers' MousePosition: each
 * system and each value in its own box so they do not run together. Only digits, fixed words
 * and the escaped name of the system go into it.
 */
export function coordinateBar(coordinate: number[]): string {
  const { x, y, lat, lon } = coordinateParts(coordinate);
  const value = (label: string, v: string) => `<span><span class="mp-label">${label}</span> ${v}</span>`;
  return (
    `<span class="mp-system"><b>${SYSTEM_HTML}</b>${value('X', x)}${value('Y', y)}</span>` +
    `<span class="mp-system"><b>WGS 84</b><span>${lat} N</span><span>${lon} E</span></span>`
  );
}

/** Length in metres, as metres below a kilometre. */
export function formatLength(metres: number): string {
  return metres < 1000 ? `${one.format(metres)} m` : `${two.format(metres / 1000)} km`;
}

/** Area in square metres: m² for small areas, hectares (with m²) for parcels, km² for large ones. */
export function formatArea(m2: number): string {
  if (m2 < 10000) return `${int.format(m2)} m²`;
  if (m2 < 1_000_000) return `${four.format(m2 / 10000)} ha (${int.format(m2)} m²)`;
  return `${two.format(m2 / 1_000_000)} km²`;
}
