import { create } from 'zustand';
import WKT from 'ol/format/WKT';
import type { Geometry } from 'ol/geom';
import { parcelLookup, type Parcel } from '@/modules';
import { areaOf } from '@/map/area';
import { t } from '@/i18n';
import { MAX_PARCELS, useMapStore } from './store';

/** What the selection knows of a parcel it lists: being asked for, found with its area, or not. */
export type ParcelEntry =
  | { status: 'loading' }
  | { status: 'ready'; parcel: Parcel; geometry: Geometry; area: number }
  /** ULDK does not know the id (a parcel since divided, a mistyped link). */
  | { status: 'missing' }
  /** ULDK did not answer. */
  | { status: 'error' };

interface ParcelStore {
  /** By full id; the order is the map store's `parcels`. */
  entries: Record<string, ParcelEntry>;
  /** What the last change did, for screen readers and the panel's status line. */
  message: string;
}

export const useParcelStore = create<ParcelStore>(() => ({ entries: {}, message: '' }));

const wkt = new WKT();
const set = (id: string, entry: ParcelEntry) => useParcelStore.setState((s) => ({ entries: { ...s.entries, [id]: entry } }));
const say = (message: string) => useParcelStore.setState({ message });

/** A found parcel, with its outline and its area from the geometry (on the ellipsoid, not the land register's). */
function remember(parcel: Parcel): ParcelEntry {
  const geometry = wkt.readGeometry(parcel.wkt);
  const entry: ParcelEntry = { status: 'ready', parcel, geometry, area: areaOf(geometry) };
  set(parcel.id, entry);
  return entry;
}

/** Asks ULDK for the parcels of the selection it does not know yet. */
function load(ids: string[]): void {
  if (!parcelLookup) return;
  for (const id of ids) {
    const known = useParcelStore.getState().entries[id];
    if (known && known.status !== 'error') continue;
    set(id, { status: 'loading' });
    parcelLookup.byId(id, new AbortController().signal).then(
      (parcel) => (parcel ? remember(parcel) : set(id, { status: 'missing' })),
      () => set(id, { status: 'error' }),
    );
  }
}

/**
 * A click on the map in the selection tool: a selected parcel under the point leaves the
 * selection, any other joins it (ULDK finds which one it is).
 */
export async function toggleParcelAt(point: [number, number]): Promise<void> {
  const { parcels, removeParcel, addParcel } = useMapStore.getState();
  const entries = useParcelStore.getState().entries;
  const selected = parcels.find((id) => {
    const entry = entries[id];
    return entry?.status === 'ready' && entry.geometry.intersectsCoordinate(point);
  });
  if (selected) {
    removeParcel(selected);
    return say(t('parcels.removed', { id: selected }));
  }
  if (!parcelLookup) return;
  if (parcels.length >= MAX_PARCELS) return say(t('parcels.full', { max: MAX_PARCELS }));
  say(t('parcels.looking'));
  let parcel: Parcel | null;
  try {
    parcel = await parcelLookup.at(point, new AbortController().signal);
  } catch {
    return say(t('parcels.error'));
  }
  if (!parcel) return say(t('parcels.none'));
  if (useMapStore.getState().parcels.includes(parcel.id)) {
    removeParcel(parcel.id);
    return say(t('parcels.removed', { id: parcel.id }));
  }
  remember(parcel);
  say(addParcel(parcel.id) ? t('parcels.added', { id: parcel.id }) : t('parcels.full', { max: MAX_PARCELS }));
}

/** Adds a parcel by id (one found by the search), once only, saying so; the subscription below fetches it. */
export function addParcel(id: string): void {
  if (useMapStore.getState().parcels.includes(id)) return say(t('parcels.already', { id }));
  say(useMapStore.getState().addParcel(id) ? t('parcels.added', { id }) : t('parcels.full', { max: MAX_PARCELS }));
}

// The parcels of a link at once, and each one added later.
load(useMapStore.getState().parcels);
useMapStore.subscribe((s, prev) => {
  if (s.parcels !== prev.parcels) load(s.parcels);
});
