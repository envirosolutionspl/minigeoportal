import { RequestError, fetchText } from '../../http.ts';

/**
 * The GUGiK sheet indexes (of the orthophotos, of the topographic maps) answer GetFeatureInfo
 * only as an HTML page; this asks one of them at a point and hands the page to the parser of
 * the index (ortho.ts, topo.ts).
 */

const TIMEOUT_MS = 10000;
const MAX_BYTES = 1_000_000;
/** EPSG:2180 extent of Poland with a margin. */
const BOUNDS = { minX: 100000, maxX: 900000, minY: 100000, maxY: 850000 };

/**
 * The index page for a point of Poland (PL-1992) in the given layers; a point outside it is a
 * RequestError, found before the layers are asked for (reading them may take a request itself).
 */
export async function indexAt(
  index: string,
  layers: () => string[] | Promise<string[]>,
  x: number,
  y: number,
  featureCount: number,
  abort?: AbortSignal,
): Promise<string> {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < BOUNDS.minX || x > BOUNDS.maxX || y < BOUNDS.minY || y > BOUNDS.maxY) {
    throw new RequestError('Invalid point');
  }
  const names = (await layers()).join(',');
  // A 2 m box around the point, queried at its centre pixel; WMS 1.3.0 in EPSG:2180 is northing first.
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetFeatureInfo',
    VERSION: '1.3.0',
    LAYERS: names,
    QUERY_LAYERS: names,
    STYLES: '',
    CRS: 'EPSG:2180',
    BBOX: [y - 1, x - 1, y + 1, x + 1].map((v) => v.toFixed(2)).join(','),
    WIDTH: '3',
    HEIGHT: '3',
    I: '1',
    J: '1',
    INFO_FORMAT: 'text/html',
    FEATURE_COUNT: String(featureCount),
  });
  return fetchText(`${index}?${params}`, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES, signal: abort });
}
