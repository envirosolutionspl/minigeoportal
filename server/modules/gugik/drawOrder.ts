import { fetchText } from '../../http.ts';
import { CONFIG_BASE, stripComments } from './geoportalConfig.ts';
import type { Overlay } from '../../../shared/config.ts';

/**
 * Drawing order of the overlays as on geoportal.gov.pl, read from the configuration of its
 * "Geoportal Krajowy" map and the main file, which defines the groups the maps share (the
 * archival data). The files are JavaScript source (object literals with comments), so they are
 * never executed: the ids of layers and groups are read in source order with a pattern, groups
 * are expanded, and the list of the map is taken bottom to top.
 */

const GEOPORTAL_CONFIG = `${CONFIG_BASE}config_parts/part_GeoportalKrajowy.js`;
const GEOPORTAL_MAIN = `${CONFIG_BASE}application.properties.js`;
const MAP_ID = 'modulGK';
const TIMEOUT_MS = 30000;
const MAX_BYTES = 2_000_000;

/** Layer ids of the map in drawing order, lowest first, with groups expanded. */
export function geoportalLayerOrder(source: string, mapId = MAP_ID): string[] {
  // Comments hold switched-off layers; "//" inside URLs is not at the start of a line.
  const code = stripComments(source);
  const children = new Map<string, string[]>();
  let owner: string | undefined;
  for (const [, key, value] of code.matchAll(/\b(id|layerId):\s*'([^']+)'/g)) {
    if (key === 'id') {
      owner = value;
      if (!children.has(value)) children.set(value, []);
    } else if (owner) children.get(owner)!.push(value);
  }
  const order: string[] = [];
  const visit = (id: string, path: Set<string>) => {
    const kids = children.get(id);
    if (kids && kids.length > 0 && !path.has(id)) {
      for (const kid of kids) visit(kid, new Set(path).add(id));
    } else if (!order.includes(id)) order.push(id);
  };
  for (const id of children.get(mapId) ?? []) visit(id, new Set([mapId]));
  return order;
}

/**
 * Our overlay ids in the geoportal's drawing order, or undefined when the configuration does not
 * list every overlay (then the app keeps its built-in order rather than guess).
 */
export function overlayOrder(source: string, overlays: Overlay[]): string[] | undefined {
  const order = geoportalLayerOrder(source);
  const ranked = overlays.map((o) => ({ id: o.id, rank: o.catalogId ? order.indexOf(o.catalogId) : -1 }));
  if (ranked.some((r) => r.rank < 0)) return undefined;
  return ranked.sort((a, b) => a.rank - b.rank).map((r) => r.id);
}

const fetchSource = (url: string) => fetchText(url, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES });

export async function fetchDrawOrder(overlays: Overlay[]): Promise<string[] | undefined> {
  const [map, main] = await Promise.all([fetchSource(GEOPORTAL_CONFIG), fetchSource(GEOPORTAL_MAIN)]);
  return overlayOrder(
    `${map}
${main}`,
    overlays,
  );
}
