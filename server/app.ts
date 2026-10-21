import { Hono, type Context } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { CapabilitiesCache } from '../src/services/meta.ts';
import { featureInfo } from './featureinfo.ts';
import { communes, counties, precincts, unitNames, voivodeships, type DictEntry } from './dictionaries.ts';
import { RequestError, concurrencyGate, isLoopback, rateLimit } from './http.ts';

/**
 * API of the app: cached service metadata, dictionaries for the parcel search and a
 * GetFeatureInfo proxy. `index.ts` adds static files and starts listening.
 */

export interface AppOptions {
  cache: CapabilitiesCache;
  refresh(): Promise<CapabilitiesCache>;
  /** Overridable in tests so bursts can be exercised quickly. */
  limits?: { dict: [burst: number, perMinute: number]; featureInfo: [burst: number, perMinute: number] };
}

export function createApp({ cache, refresh, limits }: AppOptions): Hono {
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

  app.get('/api/capabilities', (c) => {
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json(current);
  });

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
  return app;
}
