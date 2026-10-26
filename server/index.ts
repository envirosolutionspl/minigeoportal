import { readFile } from 'node:fs/promises';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { compress } from 'hono/compress';
import { etag } from 'hono/etag';
import type { Context } from 'hono';
import { alertOnCrash, alertsTo, critical } from './alerts.ts';
import { createApp } from './app.ts';
import { CACHE_FILE, readCache, refreshCache, startingCache } from './cache.ts';
import { mailerFromEnv } from './report.ts';
import * as modules from './modules/index.ts';
import { config, production } from './config.ts';
import { loadConfig } from './config/load.ts';
import { createSite, renderPage, routePage } from './html.ts';
import { follow, repeat } from './files.ts';
import type { CapabilitiesCache } from '../src/services/meta.ts';

/** Starts the API; in production it also serves the built app from ./dist. Settings: config.ts. */

/** A configuration with problems stops the server here, with every problem listed. */
const site = createSite(loadConfig(config.configDir));

// Bug reports and critical errors go to the administrator (app.yaml admin) by e-mail.
const mailer = mailerFromEnv(site.mail, site.config.app.admin);
if (!mailer) console.log('Bug reports and alert mails off: set SMTP_HOST and admin in app.yaml to turn them on.');
alertsTo(mailer, site.mail);
alertOnCrash();

let capabilities: CapabilitiesCache = await startingCache(site.defaults, config.sharedData, (built) => {
  capabilities = built;
});

// The modules' data (the geoportal layer catalog): read from disk, or built in the background.
const moduleData = await modules.start(site.defaults);

// The caches are read again when they change: written by the daily refresh below, by a cron run
// of `npm run update` or, with a shared data directory, by the updater.
await follow(CACHE_FILE, async () => {
  capabilities = (await readCache()) ?? capabilities;
});

// A single instance refreshes its caches once a day itself; instances sharing the data directory
// leave that to the updater.
if (!config.sharedData) {
  repeat(
    async () => {
      try {
        await refreshCache(site.defaults);
        await modules.update(site.defaults);
      } catch (e) {
        await critical('Data refresh failed', e);
      }
    },
    24 * 60 * 60 * 1000,
    'refresh',
  );
}

if (production && !config.origin) console.warn('APP_ORIGIN not set: bug reports cannot link to the map view.');
const app = createApp({
  site,
  cache: () => capabilities,
  mailer,
  origin: config.origin,
  moduleData,
});

if (production) {
  // The page carries the configuration in the visitor's language. It is always checked
  // (ETag), so a new release or configuration reaches everyone at once.
  const template = await readFile('./dist/index.html', 'utf8');
  const pages = new Map(site.config.app.locales.available.map((l) => [l, renderPage(template, site.client(l), site.config.skin)]));
  const page = (c: Context) => {
    const to = routePage(site, c);
    if ('redirect' in to) {
      // Which language the bare address leads to depends on the browser and the language switch.
      c.header('Cache-Control', to.permanent ? 'public, max-age=86400' : 'no-store');
      if (!to.permanent) c.header('Vary', 'Accept-Language, Cookie');
      return c.redirect(to.redirect, to.permanent ? 301 : 302);
    }
    c.header('Cache-Control', 'no-cache');
    // The bare address shows the root language to some visitors and sends the others away.
    if (site.multilingual && c.req.path === '/') c.header('Vary', 'Accept-Language, Cookie');
    return c.html(pages.get(to.locale)!);
  };
  app.get('/', compress(), etag(), page);
  app.get('/index.html', compress(), etag(), page);
  // Hashed assets never change, so they are cached for a year; .br/.gz files come from the build.
  app.use('/assets/*', async (c, next) => {
    await next();
    // A file that is not there (an old release's asset) must not be remembered for a year.
    if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('/*', serveStatic({ root: './dist', precompressed: true }));
  // A file that is not there (an old asset, a guessed icon) is a 404, not the page.
  app.get('*', (c, next) => (/\.\w+$/.test(c.req.path) ? c.notFound() : next()));
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
