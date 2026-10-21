import TileLayer from 'ol/layer/Tile';
import WMTS from 'ol/source/WMTS';
import TileWMS from 'ol/source/TileWMS';
import type TileSource from 'ol/source/Tile';
import { EPSG2180, WMS_TILE_GRID, gugikWmtsGrid } from '@/map/projection';
import type { ServiceDef } from './registry';
import { useStatusStore } from './status';

function createSource(def: ServiceDef): TileSource {
  const crossOrigin = def.cors ? 'anonymous' : undefined;
  if (def.kind === 'wmts') {
    return new WMTS({
      url: def.url,
      layer: def.layer,
      matrixSet: 'EPSG:2180',
      format: def.format,
      style: 'default',
      projection: EPSG2180,
      tileGrid: gugikWmtsGrid(def.firstLevel, def.levels),
      attributions: def.attribution,
      crossOrigin,
      wrapX: false,
    });
  }
  return new TileWMS({
    url: def.url,
    params: {
      LAYERS: def.layers,
      FORMAT: def.format ?? 'image/png',
      TRANSPARENT: true,
      VERSION: '1.3.0',
    },
    projection: EPSG2180,
    tileGrid: WMS_TILE_GRID,
    attributions: def.attribution,
    crossOrigin,
    wrapX: false,
  });
}

/** One OpenLayers layer per registry entry; visibility is driven by the store. */
export function createLayer(def: ServiceDef): TileLayer<TileSource> {
  const source = createSource(def);
  source.on('tileloadend', () => useStatusStore.getState().reportTile(def.id, true));
  source.on('tileloaderror', () => useStatusStore.getState().reportTile(def.id, false));
  const layer = new TileLayer({
    source,
    visible: false,
    opacity: def.opacity ?? 1,
    minZoom: def.minZoom === undefined ? undefined : def.minZoom - 1,
    zIndex: def.base ? 0 : 10,
    properties: { serviceId: def.id },
  });
  return layer;
}
