/** Rebuilds the capabilities cache: `npm run capabilities`. */
import { refreshCache } from './cache.ts';
import { config } from './config.ts';
import { loadConfig } from './config/load.ts';
import { createSite } from './html.ts';

const cache = await refreshCache(createSite(loadConfig(config.configDir)).defaults);
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
