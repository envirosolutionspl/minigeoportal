/**
 * Refreshes the caches in the data directory: metadata of the configured services and the data
 * of the enabled modules (the geoportal layer catalog: a minute or two, every service is checked).
 * `npm run update`; in containers the updater service runs it once a day. A service that does not
 * answer and a failed run are critical errors, mailed to the administrator.
 */
import { alertOnCrash, alertsTo, critical } from './alerts.ts';
import { refreshCache } from './cache.ts';
import { config } from './config.ts';
import { loadConfig } from './config/load.ts';
import { createSite } from './html.ts';
import * as modules from './modules/index.ts';
import { mailerFromEnv } from './report.ts';

const site = createSite(loadConfig(config.configDir));
const { defaults } = site;
alertsTo(mailerFromEnv(site.mail, site.config.app.admin), site.mail);
alertOnCrash();

const cache = await refreshCache(defaults).catch(async (e: unknown) => {
  await critical('Data refresh failed', e);
  process.exit(1);
});
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

await modules.update(defaults).catch(async (e: unknown) => {
  await critical('Data refresh failed', e);
  process.exit(1);
});
