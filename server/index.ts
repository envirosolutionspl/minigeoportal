import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { readCache, refreshCache } from './cache.ts';
import { mailerFromEnv } from './report.ts';
import { buildCatalog, readCatalog, writeCatalog, type Catalog } from './catalog.ts';
import { config, errorMessage, production } from './config.ts';

/** Starts the API; in production it also serves the built app from ./dist. Settings: config.ts. */

/**
 * The geoportal layer catalog: read from disk, or built in the background on the first start
 * (a few minutes: every service is checked), so the server answers at once and the app works on
 * its own layers meanwhile.
 */
let catalog: Catalog | undefined = await readCatalog();
let building: Promise<Catalog> | undefined;
const refreshCatalog = () => {
  building ??= buildCatalog(catalog)
    .then(async (built) => {
      catalog = built;
      await writeCatalog(built);
      return built;
    })
    .finally(() => {
      building = undefined;
    });
  return building;
};
if (!catalog) refreshCatalog().catch((e: unknown) => console.warn(`catalog: ${errorMessage(e)}`));

const mailer = mailerFromEnv();
if (!mailer) console.log('Bug reports off: set SMTP_HOST and REPORT_TO to turn them on.');
const app = createApp({
  cache: (await readCache()) ?? (await refreshCache()),
  refresh: refreshCache,
  mailer,
  origin: config.origin,
  catalog: () => catalog,
  refreshCatalog,
});

if (production) {
  // Hashed assets never change, so they are cached for a year; .br/.gz files come from the build.
  // The page itself is always checked, so a new release reaches everyone at once.
  app.use('/assets/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('/*', serveStatic({ root: './dist', precompressed: true }));
  app.get('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-cache');
  });
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`API on http://${info.address}:${info.port}`);
});
