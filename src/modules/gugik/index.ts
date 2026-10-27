import { lazy } from 'react';
import { SquareDashed } from 'lucide-react';
import { config } from '@/config/runtime';
import { t } from '@/i18n';

/**
 * The app side of the gugik module, as the registry (../index.ts) hands it to the app: each part
 * loads only when app.yaml enables it, so this file stays small and imports none of them.
 */

const gugik = config.modules.gugik;

/** Addresses, places, units and parcels from the GUGiK services (search.provider: gugik). */
export const searchProvider = () => import('./search').then((m) => m.gugikSearch);

/** The parcel search next to the search box (search.parcel). */
export const parcelTool = config.search.parcel
  ? {
      label: t('search.parcel'),
      short: t('search.parcelShort'),
      icon: SquareDashed,
      Panel: lazy(() => import('./ParcelSearch').then((m) => ({ default: m.ParcelSearch }))),
    }
  : undefined;

// The place panel's parts start loading with the app, so they are there by the first click.
const info = gugik && (gugik.parcelReport || gugik.ortho || gugik.elevation) ? import('./InfoParts') : undefined;

/** Under the coordinates of the place panel: the height of the terrain (elevation) and the parcel report link (parcelReport). */
export const infoHeader = [
  ...(info && gugik?.elevation ? [lazy(() => info.then((m) => ({ default: m.Elevation })))] : []),
  ...(info && gugik?.parcelReport ? [lazy(() => info.then((m) => ({ default: m.ParcelReportLink })))] : []),
];

/** Heights of the terrain at points of the map, from the elevation model (elevation). */
export const heightsAt = gugik?.elevation
  ? (points: [number, number][], signal: AbortSignal) => import('./elevation').then((m) => m.heightsAt(points, signal))
  : undefined;

/** The date of the aerial photo above the footer of the place panel (ortho). */
export const infoFooter = info && gugik?.ortho ? [lazy(() => info.then((m) => ({ default: m.OrthoPhoto })))] : [];

/** The layers of the time view the module knows the dates of: the archival photos (ortho.history), the old maps (topo.history). */
const photos = gugik && gugik.ortho ? gugik.ortho.history : undefined;
const oldMaps = gugik && gugik.topo ? gugik.topo.history : undefined;

/**
 * The dates a layer has at a point: of the archival photos from the photo index (the time bar
 * offers those dates only), of the old maps from the index of topographic maps (each date drawing
 * its own sheets).
 */
export const timeOptions = (layer: string) => {
  if (photos !== undefined && layer === photos) {
    return (coordinate: [number, number], signal: AbortSignal) => import('./ortho').then((m) => m.timeOptionsAt(coordinate, signal));
  }
  if (oldMaps !== undefined && layer === oldMaps) {
    return (coordinate: [number, number], signal: AbortSignal) => import('./topo').then((m) => m.timeOptionsAt(coordinate, signal));
  }
  return undefined;
};
