import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { etag } from 'hono/etag';
import { featureInfo, overlayTarget, type QueryTarget } from './featureinfo.ts';
import { RequestError, concurrencyGate, isLoopback, rateLimit } from './http.ts';
import { parseReport, type Mailer } from './report.ts';
import * as modules from './modules/index.ts';
import { nominatimSearch } from './modules/nominatim.ts';
import { errorMessage } from './config.ts';
import { connectSources, type Site } from './html.ts';

/**
 * API of the app: cached service metadata, a point-query proxy (GetFeatureInfo, ArcGIS
 * identify), the place search, bug reports by e-mail and the routes of the enabled modules
 * (modules/index.ts). `index.ts` adds static files and starts listening.
 */

interface AppOptions {
  /** The deployment's configuration (config/), per language. */
  site: Site;
  /** Service metadata as last read; `npm run update` refreshes them (index.ts reads them again). */
  cache: () => CapabilitiesCache;
  /** Sends bug reports; without it the report form answers 503. */
  mailer?: Mailer;
  /** What the enabled modules keep (modules/index.ts start). */
  moduleData?: modules.ModuleData;
  /** Public address of the app; links in reports must point here. Defaults to the request's Origin. */
  origin?: string;
  /** Overridable in tests so bursts can be exercised quickly. */
  limits?: {
    dict: [burst: number, perMinute: number];
    featureInfo: [burst: number, perMinute: number];
    report?: [burst: number, perMinute: number];
    ortho?: [burst: number, perMinute: number];
    search?: [burst: number, perMinute: number];
  };
}

export function createApp({ site, cache, mailer, origin, moduleData = {}, limits }: AppOptions): Hono {
  const overlays = new Map(site.defaults.layers.overlays.map((o) => [o.id, o]));
  const app = new Hono();

  /** Map images and tiles come from many servers (county and city ones, say), so images may load from any https host. */
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: connectSources(site.defaults),
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
      permissionsPolicy: { geolocation: ['self'], camera: [], microphone: [] },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Answers of modules (a layer catalog of ~90 KB of JSON) and GetFeatureInfo answers can be large: compressed on the way out.
  app.use('/api/*', compress());

  /** What the page carries inside (html.ts), for a page served without it. */
  app.get('/api/config', etag(), (c) => {
    c.header('Cache-Control', 'no-cache');
    if (site.multilingual) c.header('Vary', 'Accept-Language, Cookie');
    return c.json(site.client(site.locale(c)));
  });

  /** Images of the brand (app.yaml author.logo, icon): their address names the file's version, so they never go stale. */
  for (const image of Object.values(site.config.brand)) {
    app.get(image.path, (c) => {
      c.header('Content-Type', image.type);
      c.header('Cache-Control', c.req.query('v') === image.version ? 'public, max-age=31536000, immutable' : 'no-cache');
      return c.body(image.body);
    });
  }

  app.get('/api/health', (c) => c.json({ ok: true, capabilitiesGeneratedAt: cache().generatedAt }));

  /**
   * Answers that change only when the server refreshes its caches: the browser keeps them but
   * asks every time whether they are current (ETag), so a refresh reaches people at once and an
   * unchanged answer costs a 304 with no body.
   */
  const revalidated = (c: Context, version: string, body: () => unknown) => {
    const etag = `"${version}"`;
    c.header('Cache-Control', 'no-cache');
    c.header('ETag', etag);
    // The compression middleware marks the tag weak (W/"…"), and that is what browsers send back.
    const given = (c.req.header('if-none-match') ?? '').split(',').map((t) => t.trim().replace(/^W\//, ''));
    if (given.includes(etag)) return c.body(null, 304);
    return c.json(body());
  };

  app.get('/api/capabilities', (c) => {
    const current = cache();
    return revalidated(c, current.generatedAt, () => current);
  });

  /** Upstream errors are logged here and reported to the client in one generic sentence; the app shows its own text. */
  const upstreamFailure = (c: Context, where: string, e: unknown) => {
    console.warn(`${where}: ${errorMessage(e)}`);
    return c.text('Upstream service unavailable', 502);
  };

  /** One map click asks every active layer, so the burst allows a few clicks in a row. */
  const upstream = concurrencyGate(24);
  app.use('/api/featureinfo/*', rateLimit(...(limits?.featureInfo ?? [40, 60])));
  app.get('/api/featureinfo/:service', async (c) => {
    try {
      const result = await upstream(() =>
        featureInfo(
          c.req.param('service'),
          new URL(c.req.url).searchParams,
          queryTarget,
          site.defaults.map.projection.code,
          c.req.raw.signal,
        ),
      );
      if (!result) return c.text('Busy, try again shortly', 503);
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

  /** A configured layer, or one a module offers (the geoportal catalog). */
  const queryTarget = (id: string): QueryTarget | undefined => {
    const own = overlays.get(id);
    return own ? overlayTarget(own) : modules.queryTarget(moduleData, id);
  };

  modules.routes(app, { client: site.defaults, data: moduleData, upstream, upstreamFailure, revalidated, limits });

  if (site.defaults.search.provider === 'nominatim') {
    /** Places from OpenStreetMap, searched by the server for everyone (modules/nominatim.ts). */
    const { app: about } = site.config;
    const places = nominatimSearch({ ...about.search.nominatim, userAgent: `${about.id}/1.0 (+https://${about.domain})` });
    app.use('/api/search', rateLimit(...(limits?.search ?? [10, 30])));
    app.get('/api/search', async (c) => {
      const q = c.req.query('q') ?? '';
      if (q.trim().length < 3) return c.json([]);
      try {
        const hits = await places(q, site.locale(c));
        if (!hits) return c.text('Busy, try again shortly', 503);
        c.header('Cache-Control', 'public, max-age=86400');
        // Place names come in the visitor's language.
        if (site.multilingual) c.header('Vary', 'Accept-Language, Cookie');
        return c.json(hits);
      } catch (e) {
        return upstreamFailure(c, 'search', e);
      }
    });
  }

  /** A few reports per visitor and hour are plenty; the body is small JSON. */
  app.get('/api/report', (c) => c.json({ enabled: Boolean(mailer) }));
  app.post(
    '/api/report',
    rateLimit(...(limits?.report ?? [3, 0.1])),
    bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.text('Report too long', 413) }),
    async (c) => {
      if (!mailer) return c.text('Reports are off', 503);
      // Only the app's own page sends JSON: a form on another site cannot post a report
      // (a JSON body needs a CORS preflight, which no other origin passes).
      const from = c.req.header('sec-fetch-site');
      if (!/^application\/json\b/i.test(c.req.header('content-type') ?? '') || (from && from !== 'same-origin' && from !== 'none')) {
        return c.text('Forbidden', 403);
      }
      try {
        // Without APP_ORIGIN the page's own origin is accepted only from the machine itself (development).
        const own = origin ?? (isLoopback(c) ? c.req.header('origin') : undefined) ?? '';
        const report = parseReport(await c.req.json().catch(() => null), own, site.mail);
        if (report) await mailer.send(report, { userAgent: c.req.header('user-agent') });
        return c.json({ ok: true });
      } catch (e) {
        // The message for people reading the API, the code for the form, which translates it.
        if (e instanceof RequestError) return c.json({ error: e.code ?? 'invalid', message: e.message }, 400);
        console.warn(`report: ${errorMessage(e)}`);
        return c.text('Report could not be sent', 502);
      }
    },
  );

  app.all('/api/*', (c) => c.text('Not found', 404));
  return app;
}
