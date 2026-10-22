/** Rebuilds the geoportal layer catalog: `npm run catalog`. */
import { buildCatalog, readCatalog, writeCatalog } from './modules/gugik/catalog.ts';
import { config } from './config.ts';
import { loadConfig } from './config/load.ts';
import { createSite } from './html.ts';

const started = Date.now();
const catalog = await buildCatalog(createSite(loadConfig(config.configDir)).defaults.layers.overlays, await readCatalog());
await writeCatalog(catalog);
const count: Record<string, number> = {};
for (const e of catalog.entries) count[e.status] = (count[e.status] ?? 0) + 1;
console.log(`${catalog.entries.length} layers in ${Math.round((Date.now() - started) / 1000)} s:`, count);
