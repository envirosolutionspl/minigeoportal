/**
 * Service metadata derived from GetCapabilities and cached by the backend.
 * Types are shared by the server (which builds the cache) and the app (which reads it).
 */

export interface WmsLayerMeta {
  title: string;
  queryable: boolean;
  /** Visible at scales from 1:minScale (zoomed out at least that far). */
  minScale?: number;
  /** Visible at scales up to 1:maxScale (zoomed in at least that far). */
  maxScale?: number;
  legend?: string;
  /** Has named layers inside it: a group, drawn by asking for its members. */
  group?: boolean;
}

export interface WmsMeta {
  kind: 'wms';
  fetchedAt: string;
  title: string;
  infoFormats: string[];
  layers: Record<string, WmsLayerMeta>;
}

export interface TileMatrixMeta {
  id: string;
  scale: number;
  width: number;
  height: number;
}

export interface WmtsMeta {
  kind: 'wmts';
  fetchedAt: string;
  title: string;
  /** Layer, image format and style to request; registry services name their own. */
  layer?: string;
  format?: string;
  style?: string;
  /** GetFeatureInfo formats; absent or empty when the service answers no point queries. */
  infoFormats?: string[];
  matrixSet: {
    id: string;
    /** Top-left corner as [easting, northing]. */
    origin: [number, number];
    tileSize: number;
    matrices: TileMatrixMeta[];
  };
}

/** An ArcGIS REST map service (MapServer) in EPSG:2180. */
export interface RestMeta {
  kind: 'rest';
  fetchedAt: string;
  title: string;
  /** Layers by numeric id, with scale limits translated to the WMS sense. */
  layers: Record<string, WmsLayerMeta>;
  /** Tile cache of the whole service, drawn instead of images made on demand. */
  tiles?: {
    /** Top-left corner as [easting, northing]. */
    origin: [number, number];
    tileSize: number;
    resolutions: number[];
  };
}

interface MetaError {
  kind: 'error';
  fetchedAt: string;
  error: string;
}

export type ServiceMeta = WmsMeta | WmtsMeta | RestMeta | MetaError;

export interface CapabilitiesCache {
  generatedAt: string;
  services: Record<string, ServiceMeta>;
  /** Overlay ids in drawing order (lowest first) from the geoportal.gov.pl configuration. */
  drawOrder?: string[];
}

let cache: CapabilitiesCache | null = null;

async function fetchCapabilities(timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch('/api/capabilities', { signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) cache = (await res.json()) as CapabilitiesCache;
  } catch {
    // Network error or timeout.
  }
  return cache !== null;
}

/**
 * Loads the cache at startup: one short try before the map is shown, so a slow server does not
 * keep the page blank, and one more in the background for a server that is restarting.
 * Without it the app still works on registry defaults, only without scale limits.
 */
export async function loadCapabilities(): Promise<void> {
  if (await fetchCapabilities(2500)) return;
  setTimeout(() => void fetchCapabilities(8000), 2000);
}

/** Metadata of a catalog layer, loaded when it is switched on (see catalog.ts). */
export function registerMeta(id: string, meta: ServiceMeta): void {
  cache ??= { generatedAt: '', services: {} };
  cache.services[id] = meta;
}

/** Test hook: forgets the loaded cache, so the next load fetches it again. */
export const clearCapabilities = () => {
  cache = null;
};

function wmsMeta(id: string): WmsMeta | undefined {
  const m = cache?.services[id];
  return m?.kind === 'wms' ? m : undefined;
}

export function wmtsMeta(id: string): WmtsMeta | undefined {
  const m = cache?.services[id];
  return m?.kind === 'wmts' ? m : undefined;
}

export function restMeta(id: string): RestMeta | undefined {
  const m = cache?.services[id];
  return m?.kind === 'rest' ? m : undefined;
}

export function layerMeta(id: string, name: string): WmsLayerMeta | undefined {
  return (wmsMeta(id) ?? restMeta(id))?.layers[name];
}

/** Error text when GUGiK did not answer the metadata request for the service. */
export function serviceError(id: string): string | undefined {
  const m = cache?.services[id];
  return m?.kind === 'error' ? m.error : undefined;
}

/** Without metadata a layer is assumed visible at every scale. */
export function visibleAtScale(id: string, name: string, scale: number): boolean {
  const m = layerMeta(id, name);
  return scale >= (m?.minScale ?? 0) && scale <= (m?.maxScale ?? Infinity);
}

/** Preferred GetFeatureInfo format; text/xml parses most reliably, text/html is the common fallback. */
const INFO_FORMAT_PREFERENCE = ['text/xml', 'text/html', 'application/vnd.ogc.gml', 'text/plain'];

export function infoFormat(id: string): string {
  const offered = wmsMeta(id)?.infoFormats ?? [];
  return INFO_FORMAT_PREFERENCE.find((f) => offered.includes(f)) ?? 'text/html';
}

/** Overlay drawing order from the cache, when the server could read it from geoportal.gov.pl. */
export const cachedDrawOrder = (): string[] | undefined => cache?.drawOrder;
