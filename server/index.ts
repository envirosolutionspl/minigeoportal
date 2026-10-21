import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { readCache, refreshCache } from './cache.ts';

/**
 * Starts the API; in production it also serves the built app from ./dist.
 *
 * Environment: PORT (8787), HOST (127.0.0.1; 0.0.0.0 in production), NODE_ENV=production,
 * TRUSTED_PROXY=1 when a reverse proxy sets X-Forwarded-For.
 */

const production = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1');

const app = createApp({ cache: (await readCache()) ?? (await refreshCache()), refresh: refreshCache });

if (production) {
  // Hashed assets never change, so they are cached for a year; .br/.gz files come from the build.
  app.use('/assets/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('/*', serveStatic({ root: './dist', precompressed: true }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`API on http://${info.address}:${info.port}`);
});
