import { useInfoStore } from '@/state/info';
import { useMapStore } from '@/state/store';

/**
 * Events for the site's statistics (app.yaml analytics): sent to Umami's tracker when the page
 * loaded it, dropped otherwise (statistics off, a blocker). Never with what a person typed or
 * which parcel they chose: only the kind of action and ids of the configuration.
 */
export function track(name: string, data?: Record<string, string>): void {
  try {
    (window as { umami?: { track(name: string, data?: object): unknown } }).umami?.track(name, data);
  } catch {
    // The statistics never stop the map.
  }
}

/** Actions read from the stores: layers switched on, tools opened, parcels added, places clicked. */
export function watchStores(): () => void {
  const map = useMapStore.subscribe((s, prev) => {
    for (const id of s.overlays) if (!prev.overlays.includes(id)) track('layer', { id });
    if (s.tool !== prev.tool && s.tool !== 'none') track('tool', { name: s.tool });
    if (s.parcels.length > prev.parcels.length) track('parcel');
  });
  const info = useInfoStore.subscribe((s, prev) => {
    if (s.query && s.query.coordinate !== prev.query?.coordinate) track('info');
  });
  return () => {
    map();
    info();
  };
}
