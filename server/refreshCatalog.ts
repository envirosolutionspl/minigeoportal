/** Rebuilds the geoportal layer catalog: `npm run catalog`. */
import { buildCatalog, readCatalog, writeCatalog } from './catalog.ts';

const started = Date.now();
const catalog = await buildCatalog(await readCatalog());
await writeCatalog(catalog);
const count: Record<string, number> = {};
for (const e of catalog.entries) count[e.status] = (count[e.status] ?? 0) + 1;
console.log(`${catalog.entries.length} layers in ${Math.round((Date.now() - started) / 1000)} s:`, count);
