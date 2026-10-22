import { getHeight, getWidth } from 'ol/extent';
import { fromLonLat, transformExtent } from 'ol/proj';
import { config } from '@/config/runtime';
import { t } from '@/i18n';
import { PROJECTION } from '@/map/projection';
import type { Extent } from '../../shared/config';
import type { PlaceHit } from '../../shared/search';
import type { HitKind, SearchHit, SearchProvider } from './provider';

/** Larger than this (in metres) a place is shown whole, smaller as a point. */
const POINT_SIZE = 1500;
const STREETS = new Set(['road', 'street']);
const PLACES = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood', 'municipality', 'county', 'state']);

const kindOf = (type: string): HitKind => (STREETS.has(type) ? 'street' : PLACES.has(type) ? 'place' : 'address');

export function toSearchHit(place: PlaceHit): SearchHit {
  const [label, ...rest] = place.label.split(', ');
  const extent = transformExtent(place.bbox, 'EPSG:4326', PROJECTION) as Extent;
  const metres = Math.max(getWidth(extent), getHeight(extent)) * (PROJECTION.getMetersPerUnit() ?? 1);
  const center = fromLonLat(place.point, PROJECTION) as [number, number];
  return {
    kind: kindOf(place.type),
    label,
    ...(rest.length ? { detail: rest.join(', ') } : {}),
    ...(metres > POINT_SIZE ? { extent } : { center: [center[0], center[1]] }),
  };
}

/** OpenStreetMap places through the server, after Enter: the public Nominatim allows one request a second. */
export const nominatimSearch: SearchProvider = {
  instant: false,
  placeholder: t('search.nominatim.placeholder'),
  label: t('search.nominatim.label'),
  async search(query, signal) {
    const res = await fetch(`/api/search?${new URLSearchParams({ q: query, lang: config.locale })}`, { signal });
    if (!res.ok) throw new Error(`Search: HTTP ${res.status}`);
    return ((await res.json()) as PlaceHit[]).map(toSearchHit);
  },
  credit: { text: t('search.nominatim.credit'), href: 'https://www.openstreetmap.org/copyright' },
};
