import TileLayer from 'ol/layer/Tile';
import ImageLayer from 'ol/layer/Image';
import WMTS from 'ol/source/WMTS';
import ImageWMS from 'ol/source/ImageWMS';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import { EPSG2180, OGC_PIXEL, gugikTileAt, gugikWmtsGrid } from '@/map/projection';
import { OVERLAYS, type BaseMap, type Overlay } from './registry';
import { layerMeta, wmtsMeta } from './meta';
import { useStatusStore } from './status';

const report = (id: string, ok: boolean) => useStatusStore.getState().reportLoad(id, ok);

/**
 * Tile grid from the cached capabilities. Matrix sizes keep the map from requesting
 * tiles outside the published coverage. Without the cache the shared GUGiK grid is used.
 */
function tileGrid(def: BaseMap): WMTSTileGrid {
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

export function createBaseLayer(
  def: BaseMap,
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
    attributions: def.attribution,
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
    properties: { serviceId: def.id },
  });
}

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
    attributions: def.attribution,
  });
  source.on('imageloadend', () => report(def.id, true));
  source.on('imageloaderror', () => report(def.id, false));
  return new ImageLayer({
    source,
    visible: false,
    opacity: def.opacity ?? 1,
    // Registry order is drawing order: the first overlay is drawn lowest.
    zIndex: 10 + OVERLAYS.indexOf(def),
    properties: { serviceId: def.id },
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

/** Static preview tile of central Warsaw, for the base map switcher. */
export function thumbnailUrl(def: BaseMap): string {
  const seriesLevel = 10;
  const { col, row } = gugikTileAt([637000, 487500], seriesLevel);
  const matrix = `EPSG:2180:${seriesLevel - def.firstLevel}`;
  const q = new URLSearchParams({
    SERVICE: 'WMTS',
    REQUEST: 'GetTile',
    VERSION: '1.0.0',
    LAYER: def.layer,
    STYLE: 'default',
    FORMAT: def.format,
    TILEMATRIXSET: 'EPSG:2180',
    TILEMATRIX: matrix,
    TILEROW: String(row),
    TILECOL: String(col),
  });
  return `${def.url}?${q.toString()}`;
}
