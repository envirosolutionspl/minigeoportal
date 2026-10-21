/** Aerial photo behind the orthophoto map at a point, from the backend (GUGiK orthophoto index). */

export interface OrthoSheet {
  date: string;
  pixel: number;
  color: string;
  sheet: string;
  download?: string;
  sizeMb?: number;
}

export interface OrthoInfo {
  latest?: OrthoSheet;
  archived: number;
}

export async function orthoAt([x, y]: [number, number], signal: AbortSignal): Promise<OrthoInfo> {
  const res = await fetch(`/api/orto?x=${Math.round(x)}&y=${Math.round(y)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as OrthoInfo;
}

/** "5 cm", "25 cm", "1 m". */
export const pixelText = (metres: number) =>
  metres < 1 ? `${Math.round(metres * 100)} cm` : `${metres.toLocaleString('pl-PL')} m`;

/** "2025-04-27" → "27.04.2025". */
export const dateText = (iso: string) => iso.split('-').reverse().join('.');
