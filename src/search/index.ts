import { config } from '@/config/runtime';
import { t } from '@/i18n';
import { searchProviders } from '@/modules';
import { parseCoordinates } from './coordinates';
import type { SearchProvider } from './provider';

export type { HitKind, SearchHit, SearchProvider } from './provider';

/** Without a provider the box still finds coordinates. */
const coordinatesOnly: SearchProvider = {
  instant: true,
  placeholder: t('search.coordinates.placeholder'),
  label: t('search.coordinates.label'),
  search: async () => [],
};

/** The configured provider once loadSearchProvider is done; typed coordinates are answered at once, without asking it. */
export const searchProvider: SearchProvider = { ...coordinatesOnly };

/** Loads the provider of app.yaml search.provider; main.tsx waits for it with the app. */
export async function loadSearchProvider(): Promise<void> {
  const load = searchProviders[config.search.provider];
  const chosen = load ? await load() : coordinatesOnly;
  Object.assign(searchProvider, chosen, {
    search: async (query: string, signal: AbortSignal) => {
      const point = parseCoordinates(query);
      return point ? [point] : chosen.search(query, signal);
    },
  });
}
