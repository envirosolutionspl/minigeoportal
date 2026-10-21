import TileLayer from 'ol/layer/Tile';
import ImageLayer from 'ol/layer/Image';
import WMTS from 'ol/source/WMTS';
import ImageWMS from 'ol/source/ImageWMS';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import { EPSG2180, OGC_PIXEL, gugikWmtsGrid } from '@/map/projection';
import { GUGIK_ATTRIBUTION, type Overlay, type TileService } from './registry';
import { cachedDrawOrder, layerMeta, wmtsMeta } from './meta';
import { useStatusStore } from './status';

const report = (id: string, ok: boolean) => useStatusStore.getState().reportLoad(id, ok);

/**
 * Tile grid from the cached capabilities. Matrix sizes keep the map from requesting
 * tiles outside the published coverage. Without the cache the shared GUGiK grid is used.
 */
function tileGrid(def: TileService): WMTSTileGrid {
  const set = wmtsMeta(def.id)?.matrixSet;
  if (!set) return gugikWmtsGrid(def.firstLevel, def.levels);
  return new WMTSTileGrid({
    origin: set.origin,
    tileSize: set.tileSize,
    resolutions: set.matrices.map((m) => m.scale * OGC_PIXEL),
    matrixIds: set.matrices.map((m) => m.id),
    sizes: set.matrices.map((m) => [m.width, m.height]),
  });
}

/** One tile service of a base map, drawn in the given resolution range. */
export function createTileLayer(
  def: TileService,
  range: { minResolution?: number; maxResolution?: number } = {},
): TileLayer<WMTS> {
  const source = new WMTS({
    url: def.url,
    layer: def.layer,
    matrixSet: 'EPSG:2180',
    format: def.format,
    style: 'default',
    projection: EPSG2180,
    tileGrid: tileGrid(def),
    attributions: GUGIK_ATTRIBUTION,
    // GUGiK WMTS sends CORS headers; readable tiles allow exporting the map later.
    crossOrigin: 'anonymous',
    wrapX: false,
  });
  source.on('tileloadend', () => report(def.id, true));
  source.on('tileloaderror', () => report(def.id, false));
  return new TileLayer({
    source,
    visible: false,
    ...range,
    // Lower-resolution tiles stay ready, so zooming out never shows an empty map.
    preload: Infinity,
    zIndex: 0,
  });
}

/**
 * Drawing order of overlays, lowest first, as in the national geoportal (geoportal.gov.pl).
 * The server reads it from the geoportal configuration with the capabilities; this copy of it
 * is used when that fails: plans at the bottom (local plans under the general ones), utility
 * networks over them, land register parcels and buildings over both, transaction prices on
 * top. The catalog keeps its own order; this one only decides what covers what.
 */
export const DRAW_ORDER = ['kimpzp', 'pog', 'kiut', 'kieg', 'rcn'];

/** Overlays missing from the list are drawn above the listed ones. */
export const drawIndex = (id: string) => {
  const order = cachedDrawOrder() ?? DRAW_ORDER;
  const i = order.indexOf(id);
  return i < 0 ? order.length : i;
};

/**
 * Dynamic WMS as one image per view: GUGiK integration services render on demand,
 * and a single 1920x1080 image arrives faster than the ~12 tiles covering the same area.
 *
 * Loaded as plain images, without CORS: integration services redirect to county and city
 * servers, and a CORS request that follows a cross-origin redirect is sent with
 * `Origin: null`, which some of them reject (e.g. Warsaw answers 403), while others send no
 * CORS headers at all. The app never reads overlay pixels, so CORS is not needed here.
 */
export function createOverlayLayer(def: Overlay): ImageLayer<ImageWMS> {
  const source = new ImageWMS({
    url: def.url,
    params: { LAYERS: '', FORMAT: 'image/png', TRANSPARENT: true, VERSION: '1.3.0' },
    projection: EPSG2180,
    ratio: 1.25,
    attributions: GUGIK_ATTRIBUTION,
  });
  source.on('imageloadend', () => report(def.id, true));
  source.on('imageloaderror', () => report(def.id, false));
  return new ImageLayer({
    source,
    visible: false,
    opacity: def.opacity ?? 1,
    zIndex: 10 + drawIndex(def.id),
  });
}

/**
 * Resolution range in which at least one selected sublayer is drawn by the server.
 * Outside it the layer stays hidden and sends no requests.
 */
export function resolutionRange(def: Overlay, names: string[]): { min: number; max: number } {
  const meta = names.map((n) => layerMeta(def.id, n));
  const maxScale = Math.max(...meta.map((m) => m?.maxScale ?? Infinity));
  const minScale = Math.min(...meta.map((m) => m?.minScale ?? 0));
  return { min: minScale * OGC_PIXEL, max: maxScale * OGC_PIXEL };
}
