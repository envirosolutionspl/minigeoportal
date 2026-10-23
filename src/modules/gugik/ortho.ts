import { locale } from '@/i18n';

/** Aerial photo behind the orthophoto map at a point, from the backend (GUGiK orthophoto index). */

export interface OrthoSheet {
  /** Date of the flight, YYYY-MM-DD. */
  date: string;
  /** Ground size of a pixel in metres. */
  pixel: number;
  /** RGB (natural colour) or CIR (colour infrared). */
  color: string;
  sheet: string;
  /** GeoTIFF of the sheet in the open data repository. */
  download?: string;
  sizeMb?: number;
}

export interface OrthoInfo {
  /** Newest natural-colour photo, the one the orthophoto map shows. */
  latest?: OrthoSheet;
  /** Number of photos of this place in the archive, all years and colours. */
  archived: number;
}

export async function orthoAt([x, y]: [number, number], signal: AbortSignal): Promise<OrthoInfo> {
  const res = await fetch(`/api/orto?x=${Math.round(x)}&y=${Math.round(y)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as OrthoInfo;
}

/** "5 cm", "25 cm", "1 m". */
export const pixelText = (metres: number) => (metres < 1 ? `${Math.round(metres * 100)} cm` : `${metres.toLocaleString(locale())} m`);
