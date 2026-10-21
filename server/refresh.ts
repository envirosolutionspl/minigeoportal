/** Rebuilds the capabilities cache: `npm run capabilities`. */
import { refreshCache } from './cache.ts';

const cache = await refreshCache();
for (const [id, meta] of Object.entries(cache.services)) {
  const detail =
    meta.kind === 'wms'
      ? `${Object.keys(meta.layers).length} layers, GFI: ${meta.infoFormats.join(', ')}`
      : meta.kind === 'wmts'
        ? `${meta.matrixSet.matrices.length} tile matrices`
        : `ERROR ${meta.error}`;
  console.log(`${id.padEnd(10)} ${meta.kind.padEnd(5)} ${detail}`);
}
