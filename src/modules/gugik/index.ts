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
const info = gugik && (gugik.parcelReport || gugik.ortho) ? import('./InfoParts') : undefined;

/** The parcel report link under the coordinates of the place panel (parcelReport). */
export const infoHeader = info && gugik?.parcelReport ? [lazy(() => info.then((m) => ({ default: m.ParcelReportLink })))] : [];

/** The date of the aerial photo above the footer of the place panel (ortho). */
export const infoFooter = info && gugik?.ortho ? [lazy(() => info.then((m) => ({ default: m.OrthoPhoto })))] : [];

/**
 * The dates of the archival photos at a point (ortho.history names the time view's layer): the
 * photo index knows which photos exist there, so the time bar offers those dates only.
 */
export const timeOptionsAt =
  gugik && gugik.ortho && gugik.ortho.history && gugik.ortho.history === config.map.timeTravel?.layer
    ? (coordinate: [number, number], signal: AbortSignal) => import('./ortho').then((m) => m.timeOptionsAt(coordinate, signal))
    : undefined;
