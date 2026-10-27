import { useSyncExternalStore } from 'react';
import { config } from '@/config/runtime';
import { t } from '@/i18n';
import { searchProviders } from '@/modules';
import { parseCoordinates } from './coordinates';
import type { SearchProvider } from './provider';

export type { HitKind, SearchHit, SearchProvider, SearchResults } from './provider';

/** Without a provider the box still finds coordinates. */
const coordinatesOnly: SearchProvider = {
  instant: true,
  placeholder: t('search.coordinates.placeholder'),
  label: t('search.coordinates.label'),
  search: async () => [],
};

/** The configured provider once loadSearchProvider is done; typed coordinates are answered at once, without asking it. */
export const searchProvider: SearchProvider = { ...coordinatesOnly };

/** How many times a provider was put in place, so the search box knows the one it shows has changed. */
let loads = 0;
const listeners = new Set<() => void>();

/** Tells the listener each time loadSearchProvider has put a provider in place; gives back a way to stop listening. */
export function subscribeSearchProvider(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The provider for a component, which renders again once the configured one has loaded. */
export function useSearchProvider(): SearchProvider {
  useSyncExternalStore(subscribeSearchProvider, () => loads);
  return searchProvider;
}

/** Loads the provider of app.yaml search.provider; main.tsx starts it and shows the map without waiting. */
export async function loadSearchProvider(): Promise<void> {
  const load = searchProviders[config.search.provider];
  const chosen = load ? await load() : coordinatesOnly;
  Object.assign(searchProvider, chosen, {
    search: async (query: string, signal: AbortSignal) => {
      const point = parseCoordinates(query);
      return point ? [point] : chosen.search(query, signal);
    },
  });
  loads++;
  for (const listener of listeners) listener();
}
