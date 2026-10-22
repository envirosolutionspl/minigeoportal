import type { ClientConfig, Overlay, TileService } from '../../shared/config';

export type { BaseMap, BaseSource, ClientConfig, Overlay, SubLayer, TileService, Topic } from '../../shared/config';

/**
 * The deployment's configuration in the browser. The server puts it into the page
 * (<script id="boot">, see server/html.ts); main.tsx calls initConfig before the app's modules
 * load, so they may read it at their top level.
 */
export let config: ClientConfig;
export let overlayById: ReadonlyMap<string, Overlay> = new Map();
export let tileServiceById: ReadonlyMap<string, TileService> = new Map();

export function initConfig(value: ClientConfig): void {
  config = value;
  overlayById = new Map(value.layers.overlays.map((o) => [o.id, o]));
  tileServiceById = new Map(value.map.tileServices.map((s) => [s.id, s]));
}

/** The configuration inside the page, or from the API when the page came without it. */
export async function bootConfig(): Promise<ClientConfig> {
  const inline = document.getElementById('boot')?.textContent;
  if (inline) return JSON.parse(inline) as ClientConfig;
  const lang = new URLSearchParams(location.search).get('lang');
  const res = await fetch(lang ? `/api/config?${new URLSearchParams({ lang })}` : '/api/config');
  if (!res.ok) throw new Error(`Configuration: HTTP ${res.status}`);
  return (await res.json()) as ClientConfig;
}

export function defaultSublayers(def: Overlay): string[] {
  return def.sublayers.filter((l) => l.default).map((l) => l.name);
}

/** Selected sublayers in drawing order. */
export function selectedSublayers(def: Overlay, custom: Record<string, string[]>): string[] {
  const chosen = custom[def.id];
  if (!chosen) return defaultSublayers(def);
  return def.sublayers.filter((l) => chosen.includes(l.name)).map((l) => l.name);
}
