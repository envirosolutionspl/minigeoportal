/**
 * Heights of the terrain from the elevation model of GUGiK (NMT, a 1 m grid), asked from the
 * browser (the service sends CORS headers). It takes PL-1992 coordinates northing first; for a
 * point it has no data for (abroad, at sea) and when it fails it answers 0, which is no height.
 */

const NMT = 'https://services.gugik.gov.pl/nmt/';

/** A height from the service's text; 0 and anything not a number is none. */
const height = (text: string | undefined): number | null => {
  const value = Number(text);
  return Number.isFinite(value) && value !== 0 ? value : null;
};

/** "N E" of a map point (east, north), to the centimetre. */
const northFirst = ([east, north]: [number, number]) => `${north.toFixed(2)} ${east.toFixed(2)}`;

/** Heights in metres above sea level at points of the map, in their order; null where the model has none. */
export async function heightsAt(points: [number, number][], signal: AbortSignal): Promise<(number | null)[]> {
  if (points.length === 0) return [];
  if (points.length === 1) {
    const [x, y] = northFirst(points[0]).split(' ');
    const res = await fetch(`${NMT}?request=GetHByXY&x=${x}&y=${y}`, { signal });
    if (!res.ok) throw new Error(`NMT: HTTP ${res.status}`);
    return [height((await res.text()).trim())];
  }
  const list = encodeURIComponent(points.map(northFirst).join(','));
  const res = await fetch(`${NMT}?request=GetHByPointList&list=${list}`, { signal });
  if (!res.ok) throw new Error(`NMT: HTTP ${res.status}`);
  // "N E h,N E h,…" in the order asked.
  const answers = (await res.text()).trim().split(',');
  return points.map((_, i) => height(answers[i]?.trim().split(/\s+/)[2]));
}
