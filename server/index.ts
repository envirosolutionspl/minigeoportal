import { readFile } from 'node:fs/promises';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { compress } from 'hono/compress';
import { etag } from 'hono/etag';
import type { Context } from 'hono';
import { createApp } from './app.ts';
import { CACHE_FILE, readCache, refreshCache } from './cache.ts';
import { mailerFromEnv } from './report.ts';
import { CATALOG_FILE, buildCatalog, readCatalog, writeCatalog, type Catalog } from './modules/gugik/catalog.ts';
import { config, errorMessage, production } from './config.ts';
import { loadConfig } from './config/load.ts';
import { createSite, renderPage } from './html.ts';
import { follow } from './files.ts';
import type { CapabilitiesCache } from '../src/services/meta.ts';

/** Starts the API; in production it also serves the built app from ./dist. Settings: config.ts. */

/** A configuration with problems stops the server here, with every problem listed. */
const site = createSite(loadConfig(config.configDir));
const withCatalog = site.defaults.modules.gugik?.catalog === true;

let capabilities: CapabilitiesCache = (await readCache()) ?? (await refreshCache(site.defaults));

/**
 * The geoportal layer catalog (gugik module): read from disk. A single instance builds it in the
 * background on its first start (a minute or two: every service is checked), so it answers at
 * once and the app works on its own layers meanwhile; shared instances wait for the updater.
 */
let catalog: Catalog | undefined = withCatalog ? await readCatalog() : undefined;
if (withCatalog && !catalog && !config.sharedData) {
  buildCatalog(site.defaults.layers.overlays)
    .then(async (built) => {
      catalog = built;
      await writeCatalog(built);
    })
    .catch((e: unknown) => console.warn(`catalog: ${errorMessage(e)}`));
}

// With a shared data directory the updater writes the caches; this instance reads them again.
if (config.sharedData) {
  await follow(CACHE_FILE, async () => {
    capabilities = (await readCache()) ?? capabilities;
  });
  if (withCatalog) {
    await follow(CATALOG_FILE, async () => {
      catalog = (await readCatalog()) ?? catalog;
    });
  }
}

const mailer = mailerFromEnv(site.defaults);
if (!mailer) console.log('Bug reports off: set SMTP_HOST and REPORT_TO to turn them on.');
const app = createApp({
  site,
  cache: () => capabilities,
  mailer,
  origin: config.origin,
  ...(withCatalog ? { catalog: () => catalog } : {}),
});

if (production) {
  // The page carries the configuration in the visitor's language. It is always checked
  // (ETag), so a new release or configuration reaches everyone at once.
  const template = await readFile('./dist/index.html', 'utf8');
  const pages = new Map(site.config.app.locales.available.map((l) => [l, renderPage(template, site.client(l), site.config.skin)]));
  const page = (c: Context) => {
    c.header('Cache-Control', 'no-cache');
    if (site.multilingual) c.header('Vary', 'Accept-Language');
    return c.html(pages.get(site.locale(c.req.query('lang'), c.req.header('accept-language')))!);
  };
  app.get('/', compress(), etag(), page);
  app.get('/index.html', compress(), etag(), page);
  // Hashed assets never change, so they are cached for a year; .br/.gz files come from the build.
  app.use('/assets/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('/*', serveStatic({ root: './dist', precompressed: true }));
  app.get('*', compress(), etag(), page);
}

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`API on http://${info.address}:${info.port}`);
});

// A container stops with SIGTERM: requests in progress finish, new ones go to other instances.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10000).unref();
  });
}
