import { config } from '@/config/runtime';
import { t } from '@/i18n';
import { gugikSearch } from '@/modules/gugik/search';
import { parseCoordinates } from './coordinates';
import { nominatimSearch } from './nominatim';
import type { SearchProvider } from './provider';

export type { HitKind, SearchHit, SearchProvider } from './provider';

/** Without a provider the box still finds coordinates. */
const coordinatesOnly: SearchProvider = {
  instant: true,
  placeholder: t('search.coordinates.placeholder'),
  label: t('search.coordinates.label'),
  search: async () => [],
};

const chosen = { gugik: gugikSearch, nominatim: nominatimSearch, none: coordinatesOnly }[config.search.provider];

/** The configured provider; typed coordinates are answered at once, without asking it. */
export const searchProvider: SearchProvider = {
  ...chosen,
  search: async (query, signal) => {
    const point = parseCoordinates(query);
    return point ? [point] : chosen.search(query, signal);
  },
};
