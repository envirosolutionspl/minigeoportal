import { Hono, type Context } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { compress } from 'hono/compress';
import { readCache, refreshCache } from './cache.ts';
import { featureInfo } from './featureinfo.ts';
import { communes, counties, precincts, voivodeships, type DictEntry } from './dictionaries.ts';

const PORT = Number(process.env.PORT ?? 8787);
/** Serves the built app from ./dist as well; set NODE_ENV=production on the server. */
const production = process.env.NODE_ENV === 'production';

let cache = (await readCache()) ?? (await refreshCache());

const app = new Hono();
app.use('*', compress());

app.get('/api/health', (c) => c.json({ ok: true, capabilitiesGeneratedAt: cache.generatedAt }));

app.get('/api/capabilities', (c) => {
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json(cache);
});

/** Rebuilds the cache on demand; only from the local machine until an update mechanism is designed. */
app.post('/api/capabilities/refresh', async (c) => {
  const remote = c.req.header('x-forwarded-for') ?? '';
  if (production || remote) return c.text('Forbidden', 403);
  cache = await refreshCache();
  return c.json({ generatedAt: cache.generatedAt });
});

/** Dictionaries for the parcel search, cached on disk (see dictionaries.ts). */
const dictionary = (load: (parent: string) => Promise<DictEntry[]>) => async (c: Context) => {
  try {
    const entries = await load(c.req.param('parent') ?? '');
    c.header('Cache-Control', 'public, max-age=86400');
    return c.json(entries);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Upstream error';
    return c.text(message, message.startsWith('Invalid') ? 400 : 502);
  }
};
app.get('/api/dict/wojewodztwa', dictionary(() => voivodeships()));
app.get('/api/dict/powiaty/:parent', dictionary(counties));
app.get('/api/dict/gminy/:parent', dictionary(communes));
app.get('/api/dict/obreby/:parent', dictionary(precincts));

app.get('/api/featureinfo/:service', async (c) => {
  try {
    const result = await featureInfo(c.req.param('service'), new URL(c.req.url).searchParams);
    // Upstream HTML is returned as plain text and parsed by the app; it is never rendered as a page.
    c.header('Content-Type', 'text/plain; charset=utf-8');
    c.header('X-Upstream-Content-Type', result.contentType);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Content-Security-Policy', "default-src 'none'");
    c.header('Cache-Control', 'no-store');
    // Our own validation errors keep their status; any upstream failure is a bad gateway.
    const status = result.status === 200 ? 200 : result.status === 400 || result.status === 404 ? result.status : 502;
    return c.body(result.body, status);
  } catch (e) {
    return c.text(e instanceof Error ? e.message : 'Upstream error', 504);
  }
});

if (production) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`API on http://localhost:${info.port}`);
});
