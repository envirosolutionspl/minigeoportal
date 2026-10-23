import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { etag } from 'hono/etag';
import { featureInfo, overlayTarget, type QueryTarget } from './featureinfo.ts';
import { catalogIndex, serviceKey, type Catalog } from './modules/gugik/catalog.ts';
import {
  MAX_QUERY,
  communes,
  counties,
  findUnits,
  precincts,
  unitNames,
  voivodeships,
  type DictEntry,
} from './modules/gugik/dictionaries.ts';
import { RequestError, concurrencyGate, isLoopback, rateLimit } from './http.ts';
import { parseReport, type Mailer } from './report.ts';
import { orthoAt } from './modules/gugik/ortho.ts';
import { nominatimSearch } from './modules/nominatim.ts';
import { errorMessage } from './config.ts';
import { connectSources, type Site } from './html.ts';

/**
 * API of the app: cached service metadata, the geoportal layer catalog, dictionaries for the
 * parcel search, a point-query proxy (GetFeatureInfo, ArcGIS identify), the orthophoto index
 * and bug reports by e-mail. `index.ts` adds static files and starts listening.
 */

interface AppOptions {
  /** The deployment's configuration (config/), per language. */
  site: Site;
  /** Service metadata as last read; `npm run update` refreshes them (index.ts reads them again). */
  cache: () => CapabilitiesCache;
  /** Sends bug reports; without it the report form answers 503. */
  mailer?: Mailer;
  /** The geoportal layer catalog as last built; undefined while the first build runs. */
  catalog?: () => Catalog | undefined;
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

export function createApp({ site, cache, mailer, origin, catalog, limits }: AppOptions): Hono {
  const overlays = new Map(site.defaults.layers.overlays.map((o) => [o.id, o]));
  const gugik = site.defaults.modules.gugik;
  const app = new Hono();

  /** Map images and tiles come from many servers (for GUGiK: county and city ones), so images may load from any https host. */
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

  // The catalog index is ~90 KB of JSON and GetFeatureInfo answers can be large: compressed on the way out.
  app.use('/api/*', compress());

  /** What the page carries inside (html.ts), for a page served without it. */
  app.get('/api/config', etag(), (c) => {
    c.header('Cache-Control', 'no-cache');
    if (site.multilingual) c.header('Vary', 'Accept-Language');
    return c.json(site.client(site.locale(c)));
  });

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
    if (c.req.header('if-none-match') === etag) return c.body(null, 304);
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
  // The gugik module: TERYT dictionaries of the parcel and unit search, the geoportal catalog, the photo index.
  if (gugik) {
    app.use('/api/dict/*', rateLimit(...(limits?.dict ?? [30, 60])));
    app.get(
      '/api/dict/wojewodztwa',
      dictionary(() => voivodeships()),
    );
    app.get('/api/dict/powiaty/:parent', dictionary(counties));
    app.get('/api/dict/gminy/:parent', dictionary(communes));
    app.get('/api/dict/obreby/:parent', dictionary(precincts));
    app.get('/api/dict/szukaj', async (c) => {
      try {
        const hits = await findUnits((c.req.query('q') ?? '').slice(0, MAX_QUERY));
        c.header('Cache-Control', 'public, max-age=86400');
        return c.json(hits);
      } catch (e) {
        return upstreamFailure(c, 'dict', e);
      }
    });
    app.get('/api/dict/jednostki', async (c) => {
      try {
        const names = await unitNames((c.req.query('teryt') ?? '').split(',').filter(Boolean));
        c.header('Cache-Control', 'public, max-age=86400');
        return c.json(names);
      } catch (e) {
        if (e instanceof RequestError) return c.text(e.message, 400);
        return upstreamFailure(c, 'dict', e);
      }
    });
  }

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

  /**
   * A layer of the catalog may be queried when its service answered the last check: a WMS for the
   * layer names of its capabilities and of the geoportal configuration, a WMTS that lists
   * GetFeatureInfo formats for its tile layer, an ArcGIS service for its queryable layer ids.
   */
  const queryTarget = (id: string): QueryTarget | undefined => {
    const own = overlays.get(id);
    if (own) return overlayTarget(own);
    const current = catalog?.();
    const entry = current?.entries.find((e) => e.id === id);
    if (!current || !entry || entry.status !== 'ok') return undefined;
    const meta = current.services[serviceKey(entry)]?.meta;
    if (meta?.kind === 'wmts') {
      const { layer, style = 'default', format = 'image/png', infoFormats = [], matrixSet } = meta;
      if (!layer || infoFormats.length === 0) return undefined;
      const wmts = {
        layer,
        style,
        format,
        matrixSet: matrixSet.id,
        matrices: new Set(matrixSet.matrices.map((m) => m.id)),
        tileSize: matrixSet.tileSize,
        infoFormats: new Set(infoFormats),
      };
      return { kind: 'wmts', url: entry.url, layers: new Set([layer]), wmts };
    }
    if (meta?.kind === 'rest') {
      const queryable = Object.entries(meta.layers)
        .filter(([, l]) => l.queryable)
        .map(([id]) => id);
      return { kind: 'rest', url: entry.url, layers: new Set(queryable) };
    }
    if (entry.kind !== 'wms') return undefined;
    const named = meta?.kind === 'wms' ? Object.keys(meta.layers) : [];
    return { url: entry.url, layers: new Set([...named, ...(entry.sublayers ?? []).map((l) => l.name)]) };
  };

  if (gugik?.catalog) {
    /** Every layer of geoportal.gov.pl with its topic and availability; metadata come per layer. */
    let index: { of: Catalog; body: ReturnType<typeof catalogIndex> } | undefined;
    app.get('/api/catalog', (c) => {
      const current = catalog?.();
      if (!current) return c.text('Catalog not ready yet', 503);
      // The index is built once per catalog, not per request.
      if (index?.of !== current) index = { of: current, body: catalogIndex(current) };
      return revalidated(c, current.generatedAt, () => index!.body);
    });
    app.get('/api/catalog/:id', (c) => {
      const current = catalog?.();
      const entry = current?.entries.find((e) => e.id === c.req.param('id'));
      if (!current || !entry) return c.text('Not found', 404);
      return revalidated(c, `${current.generatedAt}-${encodeURIComponent(entry.id)}`, () => ({
        entry,
        meta: current.services[serviceKey(entry)]?.meta,
      }));
    });
  }

  if (gugik?.ortho) {
    /** Date and pixel size of the aerial photo at a map click; one request per click. */
    app.use('/api/orto', rateLimit(...(limits?.ortho ?? [10, 30])));
    app.get('/api/orto', async (c) => {
      try {
        const info = await upstream(() => orthoAt(c.req.query('x'), c.req.query('y'), c.req.raw.signal));
        if (!info) return c.text('Busy, try again shortly', 503);
        c.header('Cache-Control', 'public, max-age=86400');
        return c.json(info);
      } catch (e) {
        if (e instanceof RequestError) return c.text(e.message, 400);
        return upstreamFailure(c, 'orto', e);
      }
    });
  }

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
