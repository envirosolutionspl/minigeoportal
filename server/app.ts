import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { featureInfo, registryTarget, type QueryTarget } from './featureinfo.ts';
import { catalogIndex, type Catalog } from './catalog.ts';
import { communes, counties, findUnits, precincts, unitNames, voivodeships, type DictEntry } from './dictionaries.ts';
import { RequestError, concurrencyGate, isLoopback, rateLimit } from './http.ts';
import { parseReport, type Mailer } from './report.ts';
import { orthoAt } from './ortho.ts';

/**
 * API of the app: cached service metadata, dictionaries for the parcel search, a
 * GetFeatureInfo proxy and bug reports by e-mail. `index.ts` adds static files and starts listening.
 */

export interface AppOptions {
  cache: CapabilitiesCache;
  refresh(): Promise<CapabilitiesCache>;
  /** Sends bug reports; without it the report form answers 503. */
  mailer?: Mailer;
  /** The geoportal layer catalog as last built; undefined while the first build runs. */
  catalog?: () => Catalog | undefined;
  /** Rebuilds the catalog (loopback only, like the capabilities refresh). */
  refreshCatalog?: () => Promise<Catalog>;
  /** Public address of the app; links in reports must point here. Defaults to the request's Origin. */
  origin?: string;
  /** Overridable in tests so bursts can be exercised quickly. */
  limits?: {
    dict: [burst: number, perMinute: number];
    featureInfo: [burst: number, perMinute: number];
    report?: [burst: number, perMinute: number];
    ortho?: [burst: number, perMinute: number];
  };
}

export function createApp({ cache, refresh, mailer, origin, catalog, refreshCatalog, limits }: AppOptions): Hono {
  let current = cache;
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
          'https://capap.gugik.gov.pl',
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

  app.get('/api/health', (c) => c.json({ ok: true, capabilitiesGeneratedAt: current.generatedAt }));

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

  app.get('/api/capabilities', (c) => revalidated(c, current.generatedAt, () => current));

  /**
   * Rebuilds the cache on demand, only from the machine the server runs on. The custom header
   * keeps a page in a local browser from triggering it. A scheduled refresh is still to be designed.
   */
  app.post('/api/capabilities/refresh', async (c) => {
    if (!isLoopback(c) || c.req.header('x-refresh') !== 'capabilities') return c.text('Forbidden', 403);
    current = await refresh();
    return c.json({ generatedAt: current.generatedAt });
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
  app.use('/api/dict/*', rateLimit(...(limits?.dict ?? [30, 60])));
  app.get('/api/dict/wojewodztwa', dictionary(() => voivodeships()));
  app.get('/api/dict/powiaty/:parent', dictionary(counties));
  app.get('/api/dict/gminy/:parent', dictionary(communes));
  app.get('/api/dict/obreby/:parent', dictionary(precincts));
  app.get('/api/dict/szukaj', async (c) => {
    try {
      const hits = await findUnits((c.req.query('q') ?? '').slice(0, 80));
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

  /** One map click asks up to five services, so the burst allows a few clicks in a row. */
  const upstream = concurrencyGate(24);
  app.use('/api/featureinfo/*', rateLimit(...(limits?.featureInfo ?? [40, 60])));
  app.get('/api/featureinfo/:service', async (c) => {
    try {
      const result = await upstream(() => featureInfo(c.req.param('service'), new URL(c.req.url).searchParams, queryTarget));
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

  /**
   * A layer of the catalog may be queried when its WMS answered the last check; the layer names
   * allowed are those of its capabilities and of the geoportal configuration.
   */
  const queryTarget = (id: string): QueryTarget | undefined => {
    const own = registryTarget(id);
    if (own) return own;
    const current = catalog?.();
    const entry = current?.entries.find((e) => e.id === id);
    if (!current || !entry || entry.kind !== 'wms' || entry.status !== 'ok') return undefined;
    const meta = current.services[entry.url]?.meta;
    return { url: entry.url, layers: new Set([...Object.keys(meta?.layers ?? {}), ...(entry.sublayers ?? []).map((l) => l.name)]) };
  };

  /** Every layer of geoportal.gov.pl with its topic and availability; metadata come per layer. */
  app.get('/api/catalog', (c) => {
    const current = catalog?.();
    if (!current) return c.text('Katalog warstw jest w przygotowaniu, spróbuj za chwilę.', 503);
    return revalidated(c, current.generatedAt, () => catalogIndex(current));
  });
  app.get('/api/catalog/:id', (c) => {
    const current = catalog?.();
    const entry = current?.entries.find((e) => e.id === c.req.param('id'));
    if (!current || !entry) return c.text('Not found', 404);
    return revalidated(c, `${current.generatedAt}-${entry.id}`, () => ({ entry, meta: current.services[entry.url]?.meta }));
  });
  app.post('/api/catalog/refresh', async (c) => {
    if (!refreshCatalog || !isLoopback(c) || c.req.header('x-refresh') !== 'catalog') return c.text('Forbidden', 403);
    const built = await refreshCatalog();
    return c.json({ generatedAt: built.generatedAt, layers: built.entries.length });
  });

  /** Date and pixel size of the aerial photo at a map click; one request per click. */
  app.use('/api/orto', rateLimit(...(limits?.ortho ?? [10, 30])));
  app.get('/api/orto', async (c) => {
    try {
      const info = await upstream(() => orthoAt(c.req.query('x'), c.req.query('y')));
      if (!info) return c.text('Serwer jest zajęty, spróbuj za chwilę.', 503);
      c.header('Cache-Control', 'public, max-age=86400');
      return c.json(info);
    } catch (e) {
      if (e instanceof RequestError) return c.text(e.message, 400);
      return upstreamFailure(c, 'orto', e);
    }
  });

  /** A few reports per visitor and hour are plenty; the body is small JSON. */
  app.get('/api/report', (c) => c.json({ enabled: Boolean(mailer) }));
  app.post(
    '/api/report',
    rateLimit(...(limits?.report ?? [3, 0.1])),
    bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.text('Zgłoszenie jest za długie', 413) }),
    async (c) => {
      if (!mailer) return c.text('Formularz zgłoszeń jest wyłączony.', 503);
      try {
        const report = parseReport(await c.req.json().catch(() => null), origin ?? c.req.header('origin') ?? '');
        if (report) await mailer.send(report, { userAgent: c.req.header('user-agent') });
        return c.json({ ok: true });
      } catch (e) {
        if (e instanceof RequestError) return c.text(e.message, 400);
        console.warn(`report: ${e instanceof Error ? e.message : String(e)}`);
        return c.text('Nie udało się wysłać zgłoszenia. Spróbuj ponownie później.', 502);
      }
    },
  );

  app.all('/api/*', (c) => c.text('Not found', 404));
  return app;
}
