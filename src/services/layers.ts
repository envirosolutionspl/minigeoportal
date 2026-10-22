import TileLayer from 'ol/layer/Tile';
import ImageLayer from 'ol/layer/Image';
import WMTS from 'ol/source/WMTS';
import XYZ from 'ol/source/XYZ';
import ImageWMS from 'ol/source/ImageWMS';
import ImageArcGISRest from 'ol/source/ImageArcGISRest';
import TileGrid from 'ol/tilegrid/TileGrid';
import WMTSTileGrid from 'ol/tilegrid/WMTS';
import { EPSG2180, OGC_PIXEL, gugikWmtsGrid } from '@/map/projection';
import { GUGIK_ATTRIBUTION, OVERLAY_BY_ID, type Overlay, type TileService } from './registry';
import { useCatalog } from './catalog';
import { cachedDrawOrder, layerMeta, restMeta, wmtsMeta, type WmtsMeta } from './meta';
import { useStatusStore } from './status';

const report = (id: string, ok: boolean) => useStatusStore.getState().reportLoad(id, ok);

/**
 * Tile grid from the cached capabilities. Matrix sizes keep the map from requesting
 * tiles outside the published coverage. Without the cache the shared GUGiK grid is used.
 */
function tileGrid(def: TileService): WMTSTileGrid {
  const set = wmtsMeta(def.id)?.matrixSet;
  return set ? gridOf(set) : gugikWmtsGrid(def.firstLevel, def.levels);
}

function gridOf(set: WmtsMeta['matrixSet']): WMTSTileGrid {
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
    matrixSet: wmtsMeta(def.id)?.matrixSet.id ?? 'EPSG:2180',
    format: def.format,
    style: 'default',
    projection: EPSG2180,
    tileGrid: tileGrid(def),
    attributions: GUGIK_ATTRIBUTION,
    // GUGiK WMTS sends CORS headers; readable tiles keep an image export possible.
    crossOrigin: 'anonymous',
    wrapX: false,
  });
  source.on('tileloadend', () => report(def.id, true));
  source.on('tileloaderror', () => report(def.id, false));
  return new TileLayer({
    source,
    visible: false,
    ...range,
    // One coarser level stays ready, so zooming out never shows an empty map.
    preload: 1,
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
export const DRAW_ORDER = ['suikzp', 'kimpzp', 'pog', 'kibdot', 'kiut', 'kieg', 'rcn', 'kina', 'prg'];

/**
 * Place of an overlay in the drawing order. Our own overlays follow the order above; a layer of
 * the geoportal catalog goes just above the highest of ours that the geoportal draws below it,
 * so the two lists interleave as on geoportal.gov.pl. Unknown layers go on top.
 */
const drawIndex = (id: string) => {
  const order = cachedDrawOrder() ?? DRAW_ORDER;
  const i = order.indexOf(id);
  if (i >= 0) return i;
  const { byId } = useCatalog.getState();
  const entry = byId.get(id);
  if (!entry) return order.length;
  const ranks = order.map((own) => {
    const gid = OVERLAY_BY_ID.get(own)?.geoportalId;
    return gid ? byId.get(gid)?.order : undefined;
  });
  if (ranks.every((r) => r === undefined)) return order.length + entry.order / 1e5;
  const below = ranks.reduce<number>((top, r, k) => (r !== undefined && r < entry.order ? k : top), -1);
  return below + 0.5 + entry.order / 1e5;
};

export type OverlayLayer = ImageLayer<ImageWMS | ImageArcGISRest> | TileLayer<WMTS | XYZ>;

/**
 * Map layer of an overlay. A dynamic WMS or ArcGIS map service is drawn as one image per view:
 * GUGiK integration services render on demand, and a single 1920x1080 image arrives faster
 * than the ~12 tiles covering the same area. A WMTS or an ArcGIS tile cache is drawn as tiles.
 *
 * Loaded as plain images, without CORS: integration services redirect to county and city
 * servers, and a CORS request that follows a cross-origin redirect is sent with
 * `Origin: null`, which some of them reject (e.g. Warsaw answers 403), while others send no
 * CORS headers at all. The app never reads overlay pixels, so CORS is not needed here.
 */
export function createOverlayLayer(def: Overlay): OverlayLayer {
  const options = { visible: false, opacity: def.opacity ?? 1, zIndex: 10 + drawIndex(def.id) };
  const tiles = tileSource(def);
  if (tiles) {
    tiles.on('tileloadend', () => report(def.id, true));
    tiles.on('tileloaderror', () => report(def.id, false));
    return new TileLayer({ source: tiles, ...options });
  }
  const image = { url: def.url, projection: EPSG2180, ratio: 1.25, attributions: GUGIK_ATTRIBUTION };
  const source =
    def.kind === 'rest'
      ? new ImageArcGISRest({ ...image, params: { LAYERS: 'show:', FORMAT: 'png32', TRANSPARENT: true } })
      : new ImageWMS({ ...image, params: { LAYERS: '', FORMAT: 'image/png', TRANSPARENT: true, VERSION: '1.3.0' } });
  source.on('imageloadend', () => report(def.id, true));
  source.on('imageloaderror', () => report(def.id, false));
  return new ImageLayer({ source, ...options });
}

/** Tiles of a catalog WMTS or ArcGIS tile cache, on the grid its server described. */
function tileSource(def: Overlay): WMTS | XYZ | undefined {
  const common = { projection: EPSG2180, attributions: GUGIK_ATTRIBUTION, wrapX: false };
  const wmts = def.kind === 'wmts' ? wmtsMeta(def.id) : undefined;
  if (wmts) {
    return new WMTS({
      ...common,
      url: def.url,
      layer: wmts.layer ?? def.sublayers[0]?.name ?? '',
      matrixSet: wmts.matrixSet.id,
      format: wmts.format ?? 'image/png',
      style: wmts.style ?? 'default',
      tileGrid: gridOf(wmts.matrixSet),
    });
  }
  const cache = def.kind === 'rest' ? restMeta(def.id)?.tiles : undefined;
  if (cache) {
    return new XYZ({
      ...common,
      url: `${def.url.replace(/\/+$/, '')}/tile/{z}/{y}/{x}`,
      tileGrid: new TileGrid({ origin: cache.origin, resolutions: cache.resolutions, tileSize: cache.tileSize }),
    });
  }
  return undefined;
}

/** Asks the server for the chosen sublayers; tiles are one picture and have none to choose. */
export function showSublayers(layer: OverlayLayer, names: string[]): void {
  const source = layer.getSource();
  const value = source instanceof ImageArcGISRest ? `show:${names.join(',')}` : names.join(',');
  if ((source instanceof ImageWMS || source instanceof ImageArcGISRest) && source.getParams().LAYERS !== value) {
    source.updateParams({ LAYERS: value });
  }
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
