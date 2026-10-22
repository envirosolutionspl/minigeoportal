/**
 * Refreshes the caches in the data directory: metadata of the configured services and, with the
 * gugik module, the geoportal layer catalog (a minute or two: every service is checked).
 * `npm run update`; in containers the updater service runs it once a day.
 */
import { refreshCache } from './cache.ts';
import { config } from './config.ts';
import { loadConfig } from './config/load.ts';
import { createSite } from './html.ts';
import { buildCatalog, readCatalog, writeCatalog } from './modules/gugik/catalog.ts';

const { defaults } = createSite(loadConfig(config.configDir));

const cache = await refreshCache(defaults);
for (const [id, meta] of Object.entries(cache.services)) {
  const detail =
    meta.kind === 'wms'
      ? `${Object.keys(meta.layers).length} layers, GFI: ${meta.infoFormats.join(', ')}`
      : meta.kind === 'wmts'
        ? `${meta.matrixSet.matrices.length} tile matrices`
        : meta.kind === 'rest'
          ? `${Object.keys(meta.layers).length} layers`
          : `ERROR ${meta.error}`;
  console.log(`${id.padEnd(10)} ${meta.kind.padEnd(5)} ${detail}`);
}

if (defaults.modules.gugik?.catalog) {
  const started = Date.now();
  const catalog = await buildCatalog(defaults.layers.overlays, await readCatalog());
  await writeCatalog(catalog);
  const count: Record<string, number> = {};
  for (const e of catalog.entries) count[e.status] = (count[e.status] ?? 0) + 1;
  console.log(`catalog: ${catalog.entries.length} layers in ${Math.round((Date.now() - started) / 1000)} s:`, count);
}
