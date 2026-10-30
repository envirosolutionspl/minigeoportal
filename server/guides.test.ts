import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { attachGuides, guidesOf } from './guides.ts';
import { site } from './testSite.ts';

const config = site.config;
const app = new Hono();
attachGuides(app, config);

describe('guides', () => {
  it('reads every configured page in the languages that have it, titled by its heading', () => {
    const guides = guidesOf(config);
    expect(guides.map((g) => g.path)).toEqual([
      '/pomoc/czy-dzialka-jest-budowlana',
      '/pomoc/teren-zalewowy',
      '/pomoc/granice-i-wymiary-dzialki',
      '/pomoc/numer-ksiegi-wieczystej',
    ]);
    expect(guides[0]).toMatchObject({ locale: 'pl', title: 'Jak sprawdzić, czy działka jest budowlana' });
    expect(guides[0].description.length).toBeLessThanOrEqual(160);
    expect(guides[0].description).toMatch(/^Czy na działce można postawić dom/);
  });

  it('serves a page search engines can read: title, description, canonical address, a way into the map and the others', async () => {
    const res = await app.request('/pomoc/teren-zalewowy');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    const html = await res.text();
    expect(html).toContain('<html lang="pl">');
    expect(html).toContain('<title>Jak sprawdzić, czy działka leży na terenie zalewowym – MiniGeoportal</title>');
    expect(html).toContain('<link rel="canonical" href="https://minigeoportal.pl/pomoc/teren-zalewowy" />');
    expect(html).toMatch(/<meta name="description" content="Mapy zagrożenia powodziowego[^"]*" \/>/);
    expect(html).toContain('<a class="map" href="/">Sprawdź na mapie</a>');
    expect(html).toContain('<a href="/pomoc/czy-dzialka-jest-budowlana">Jak sprawdzić, czy działka jest budowlana</a>');
    expect(html).not.toContain('<a href="/pomoc/teren-zalewowy">');
    expect(html).not.toContain('<script');
  });

  it('carries the sign and name of the app, leading to the map, and the logo of the author on its plate', async () => {
    const html = await (await app.request('/pomoc/teren-zalewowy')).text();
    expect(html).toMatch(
      /<a class="brand" href="\/"><svg viewBox="0 0 104 104" aria-hidden="true">.*<\/svg><span>Mini<b>Geoportal<\/b><\/span><\/a>/,
    );
    const logo = config.brand.logo!;
    expect(html).toContain(
      `<footer>Stworzone przez <a href="https://envirosolutions.pl"><img src="/brand/logo.svg?v=${logo.version}" alt="EnviroSolutions" /></a></footer>`,
    );
  });

  it('lists the pages of a language at its path, and has none where no file is', async () => {
    const html = await (await app.request('/pomoc')).text();
    expect(html).toContain('<h1>Poradniki</h1>');
    expect(html.match(/<li>/g)).toHaveLength(4);
    expect((await app.request('/en/help')).status).toBe(404);
    expect((await app.request('/en/help/teren-zalewowy')).status).toBe(404);
  });

  it('points search engines to the sitemap, which lists the home pages, the list and the guides', async () => {
    expect(await (await app.request('/robots.txt')).text()).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://minigeoportal.pl/sitemap.xml\n',
    );
    const res = await app.request('/sitemap.xml');
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    const urls = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(urls).toEqual([
      'https://minigeoportal.pl/',
      'https://minigeoportal.pl/en/',
      'https://minigeoportal.pl/pomoc',
      'https://minigeoportal.pl/pomoc/czy-dzialka-jest-budowlana',
      'https://minigeoportal.pl/pomoc/teren-zalewowy',
      'https://minigeoportal.pl/pomoc/granice-i-wymiary-dzialki',
      'https://minigeoportal.pl/pomoc/numer-ksiegi-wieczystej',
    ]);
  });

  it('keeps robots and the sitemap for a deployment without guides', async () => {
    const plain = new Hono();
    attachGuides(plain, { ...config, app: { ...config.app, guides: undefined } });
    expect((await plain.request('/pomoc')).status).toBe(404);
    expect(await (await plain.request('/sitemap.xml')).text()).not.toContain('/pomoc');
  });
});
