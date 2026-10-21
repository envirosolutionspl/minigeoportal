import { Hono, type Context } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { secureHeaders } from 'hono/secure-headers';
import { readCache, refreshCache } from './cache.ts';
import { featureInfo } from './featureinfo.ts';
import { communes, counties, precincts, voivodeships, type DictEntry } from './dictionaries.ts';
import { RequestError, concurrencyGate, isLoopback, rateLimit } from './http.ts';

/**
 * API of the app: cached service metadata, dictionaries for the parcel search and a
 * GetFeatureInfo proxy. In production it also serves the built app from ./dist.
 *
 * Environment: PORT (8787), HOST (127.0.0.1; 0.0.0.0 in production), NODE_ENV=production,
 * TRUSTED_PROXY=1 when a reverse proxy sets X-Forwarded-For.
 */

const production = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1');

let cache = (await readCache()) ?? (await refreshCache());

const app = new Hono();

/** Map images and tiles come from GUGiK, county and city servers, so images may load from any https host. */
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: [
        "'self'",
        'https://services.gugik.gov.pl',
        'https://uldk.gugik.gov.pl',
        'https://mapy.geoportal.gov.pl',
        'https://integracja.gugik.gov.pl',
        'https://integracja01.gugik.gov.pl',
        'https://integracja02.gugik.gov.pl',
      ],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },
    permissionsPolicy: { geolocation: ['self'], camera: [], microphone: [] },
    crossOriginEmbedderPolicy: false,
  }),
);

app.get('/api/health', (c) => c.json({ ok: true, capabilitiesGeneratedAt: cache.generatedAt }));

app.get('/api/capabilities', (c) => {
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json(cache);
});

/**
 * Rebuilds the cache on demand, only from the machine the server runs on. The custom header
 * keeps a page in a local browser from triggering it. A scheduled refresh is still to be designed.
 */
app.post('/api/capabilities/refresh', async (c) => {
  if (!isLoopback(c) || c.req.header('x-refresh') !== 'capabilities') return c.text('Forbidden', 403);
  cache = await refreshCache();
  return c.json({ generatedAt: cache.generatedAt });
});

/** Upstream errors are logged here and reported to the client in one generic sentence. */
const upstreamFailure = (c: Context, where: string, e: unknown) => {
  console.warn(`${where}: ${e instanceof Error ? e.message : String(e)}`);
  return c.text('Usługa źródłowa nie odpowiada. Spróbuj ponownie za chwilę.', 502);
};

const dictionary = (load: (parent: string) => Promise<DictEntry[]>) => async (c: Context) => {
  try {
    const entries = await load(c.req.param('parent') ?? '');
    c.header('Cache-Control', 'public, max-age=86400');
    return c.json(entries);
  } catch (e) {
    if (e instanceof RequestError) return c.text(e.message, 400);
    return upstreamFailure(c, 'dict', e);
  }
};
app.use('/api/dict/*', rateLimit(30, 60));
app.get('/api/dict/wojewodztwa', dictionary(() => voivodeships()));
app.get('/api/dict/powiaty/:parent', dictionary(counties));
app.get('/api/dict/gminy/:parent', dictionary(communes));
app.get('/api/dict/obreby/:parent', dictionary(precincts));

/** One map click asks up to five services, so the burst allows a few clicks in a row. */
const upstream = concurrencyGate(24);
app.use('/api/featureinfo/*', rateLimit(40, 60));
app.get('/api/featureinfo/:service', async (c) => {
  try {
    const result = await upstream(() => featureInfo(c.req.param('service'), new URL(c.req.url).searchParams));
    if (!result) return c.text('Serwer jest zajęty, spróbuj za chwilę.', 503);
    // Upstream markup is returned as plain text and parsed by the app; it is never rendered as a page.
    c.header('Content-Type', 'text/plain; charset=utf-8');
    c.header('X-Upstream-Content-Type', result.contentType);
    c.header('Cache-Control', 'no-store');
    return c.body(result.body);
  } catch (e) {
    if (e instanceof RequestError) return c.text(e.message, 400);
    return upstreamFailure(c, 'featureinfo', e);
  }
});

app.all('/api/*', (c) => c.text('Not found', 404));

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
