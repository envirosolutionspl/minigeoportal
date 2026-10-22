import type { SearchHit, SearchProvider } from '@/search/provider';
import { buildingAt, placeOutline, search, unitOutline } from './geocoder';

const OUTLINE_TIMEOUT_MS = 2500;
/** A unit has no point to fall back on, so its boundary may take longer. */
const UNIT_TIMEOUT_MS = 8000;

/** Addresses, places, units, physiographic objects and parcels from the GUGiK services, as people type. */
export const gugikSearch: SearchProvider = {
  instant: true,
  placeholder: 'Adres, miejscowość, działka…',
  label: 'Szukaj adresu, miejscowości lub działki',
  search,
  /**
   * Places and addresses come as points; their outline (town boundary, building) is looked up
   * separately, without delaying the map for long. Parcels, units, buildings and river courses
   * stay on the map until the search is cleared.
   */
  async outline(hit: SearchHit) {
    const signal = AbortSignal.timeout(OUTLINE_TIMEOUT_MS);
    if (hit.unit) return { wkt: await unitOutline(hit.unit, AbortSignal.timeout(UNIT_TIMEOUT_MS)).catch(() => undefined), persist: true };
    if (hit.kind === 'place') return { wkt: await placeOutline(hit, signal).catch(() => undefined), persist: false };
    if (hit.kind === 'address' && hit.center) {
      const building = await buildingAt(hit.center, signal).catch(() => undefined);
      return { wkt: building, persist: Boolean(building) };
    }
    return { wkt: hit.wkt, persist: hit.kind === 'parcel' || (hit.kind === 'nature' && Boolean(hit.wkt)) };
  },
};
