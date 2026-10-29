import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Hono } from 'hono';
import { connectSources, createSite, pickLocale, renderPage, routePage, scriptJson } from './html.ts';
import { GUGIK_SEARCH_HOSTS } from './modules/gugik/searchHosts.ts';
import { defaults, site } from './testSite.ts';

const TEMPLATE = `<!doctype html>
<html lang="pl">
  <head>
    <title>Stary tytuł</title>
    <meta
      name="description"
      content="Stary opis"
    />
  </head>
  <body></body>
</html>`;

describe('pickLocale', () => {
  it('takes the language chosen, then the browser preferences, then the default', () => {
    expect(pickLocale(['pl', 'en'], 'pl', ['en'], 'pl')).toBe('en');
    expect(pickLocale(['pl', 'en'], 'pl', [undefined, 'en'], 'pl')).toBe('en');
    expect(pickLocale(['pl', 'en'], 'pl', ['de'], 'de-DE,en-GB;q=0.8,pl;q=0.5')).toBe('en');
    expect(pickLocale(['pl', 'en'], 'pl', [], 'fr')).toBe('pl');
    expect(pickLocale(['pl'], 'pl')).toBe('pl');
  });
});

describe('routePage', () => {
  const app = new Hono().get('*', (c) => c.json(routePage(site, c)));
  const route = async (path: string, headers: Record<string, string> = {}) => (await app.request(path, { headers })).json();

  it('shows Polish (locales.root) at the bare address to Polish browsers, English elsewhere', async () => {
    expect(await route('/', { 'accept-language': 'pl-PL,pl;q=0.9,en;q=0.8' })).toEqual({ locale: 'pl' });
    expect(await route('/', { 'accept-language': 'de-DE,de;q=0.9' })).toEqual({ redirect: '/en/', permanent: false });
  });

  it('gives a request without any language (a link preview, a crawler) what lives at the bare address', async () => {
    expect(await route('/')).toEqual({ locale: 'pl' });
    expect(await route('/?x=1')).toEqual({ locale: 'pl' });
    expect(await route('/', { cookie: 'lang=en' })).toEqual({ redirect: '/en/', permanent: false });
  });

  it('prefers the language chosen with the switch (its cookie) to the browser', async () => {
    expect(await route('/', { cookie: 'lang=en', 'accept-language': 'pl' })).toEqual({ redirect: '/en/', permanent: false });
    expect(await route('/', { cookie: 'lang=pl', 'accept-language': 'en' })).toEqual({ locale: 'pl' });
  });

  it('keeps the view and turns old ?lang= links into language addresses', async () => {
    expect(await route('/?x=1&lang=en', { 'accept-language': 'pl' })).toEqual({ redirect: '/en/?x=1', permanent: false });
    expect(await route('/?x=1&lang=pl', { 'accept-language': 'en' })).toEqual({ locale: 'pl' });
    expect(await route('/en/?lang=pl&x=1')).toEqual({ redirect: '/?x=1', permanent: false });
    expect(await route('/en?x=1')).toEqual({ redirect: '/en/?x=1', permanent: true });
    expect(await route('/pl/?x=1')).toEqual({ redirect: '/?x=1', permanent: true });
    expect(await route('/de/', { 'accept-language': 'pl' })).toEqual({ redirect: '/', permanent: false });
  });

  it('without locales.root gives every language its own address, the bare one only redirects', async () => {
    const { config } = site;
    const general = createSite({ ...config, app: { ...config.app, locales: { ...config.app.locales, root: undefined } } });
    const own = new Hono().get('*', (c) => c.json(routePage(general, c)));
    const go = async (path: string, lang: string) => (await own.request(path, { headers: { 'accept-language': lang } })).json();
    expect(await go('/', 'pl')).toEqual({ redirect: '/pl/', permanent: false });
    expect(await (await own.request('/')).json()).toEqual({ redirect: '/en/', permanent: false });
    expect(await go('/pl/', 'en')).toEqual({ locale: 'pl' });
    expect(general.client('pl').localePaths).toEqual({ pl: '/pl/', en: '/en/' });
  });

  it('serves the page of the language its address names, whatever the browser prefers', async () => {
    expect(await route('/en/', { cookie: 'lang=pl', 'accept-language': 'pl' })).toEqual({ locale: 'en' });
  });
});

describe('renderPage', () => {
  it('puts the language, title, description and configuration into the page', () => {
    const page = renderPage(TEMPLATE, { ...defaults, app: { ...defaults.app, title: 'A & B', description: 'Opis "x"' } });
    expect(page).toContain('<html lang="en">');
    expect(page).toContain('<title>A &amp; B</title>');
    expect(page).toContain('content="Opis &quot;x&quot;"');
    // A text of the configuration is not a replacement pattern.
    expect(renderPage(TEMPLATE, { ...defaults, app: { ...defaults.app, title: 'Cena $& $1 $`' } })).toContain(
      '<title>Cena $&amp; $1 $`</title>',
    );
    const boot = /<script type="application\/json" id="boot">(.*)<\/script>/.exec(page)![1];
    expect(JSON.parse(boot)).toEqual({ ...defaults, app: { ...defaults.app, title: 'A & B', description: 'Opis "x"' } });
  });

  it('names the canonical address and what a shared link shows', () => {
    const home = `https://${defaults.app.domain}`;
    const page = renderPage(TEMPLATE, { ...defaults, app: { ...defaults.app, title: 'A & "B"' } });
    // Each language has its own address; the bare one is for search engines the visitor's choice.
    expect(page).toContain(`<link rel="canonical" href="${home}/en/" />`);
    expect(page).toContain(`<link rel="alternate" hreflang="pl" href="${home}/" />`);
    expect(page).toContain(`<link rel="alternate" hreflang="en" href="${home}/en/" />`);
    expect(page).toContain(`<link rel="alternate" hreflang="x-default" href="${home}/" />`);
    expect(page).toContain(`<meta property="og:url" content="${home}/en/" />`);
    const single = renderPage(TEMPLATE, { ...defaults, locales: ['en'], localePaths: { en: '/' } });
    expect(single).toContain(`<link rel="canonical" href="${home}/" />`);
    expect(single).not.toContain('hreflang');
    expect(page).toContain('<meta property="og:title" content="A &amp; &quot;B&quot;" />');
    expect(page).toContain(`<meta property="og:image" content="${home}/apple-touch-icon.png" />`);
  });

  it('keeps the icons of the app, or puts in the icon of the configuration', () => {
    const template = readFileSync('index.html', 'utf8');
    expect(renderPage(template, defaults)).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
    const page = renderPage(template, { ...defaults, app: { ...defaults.app, icon: '/brand/icon.png?v=1&x' } });
    expect(page.match(/<link rel="(icon|apple-touch-icon)"[^>]*>/g)).toEqual([
      '<link rel="icon" href="/brand/icon.png?v=1&amp;x" />',
      '<link rel="apple-touch-icon" href="/brand/icon.png?v=1&amp;x" />',
    ]);
    expect(page).toContain(`<meta property="og:image" content="https://${defaults.app.domain}/brand/icon.png?v=1&amp;x" />`);
  });

  it('puts the skin into the page, unable to close its element', () => {
    const page = renderPage(TEMPLATE, defaults, ':root { --accent: #123456; } /* </style><script> */');
    expect(page).toContain('<style id="skin">:root { --accent: #123456; }');
    expect(page.match(/<\/style>/g)).toHaveLength(1);
  });

  it('keeps configuration text from closing its script', () => {
    const json = scriptJson({ text: '</script><script>alert(1)</script>\u2028' });
    expect(json).not.toContain('<');
    expect(JSON.parse(json)).toEqual({ text: '</script><script>alert(1)</script>\u2028' });
  });
});

describe('size', () => {
  it('keeps the configuration inside the page small: under 12 KB compressed', () => {
    expect(gzipSync(scriptJson(defaults)).length).toBeLessThan(12 * 1024);
  });
});

describe('connections', () => {
  it('opens the first map servers early and allows the GUGiK search hosts only with that search, the elevation model and the geocoder with their parts', () => {
    const page = renderPage(TEMPLATE, defaults);
    expect(page).toContain('<link rel="preconnect" href="https://mapy.geoportal.gov.pl" crossorigin />');
    expect(page).toContain('<link rel="preconnect" href="https://integracja.gugik.gov.pl" />');
    expect(connectSources(defaults)).toEqual(["'self'", ...GUGIK_SEARCH_HOSTS]);
    const noSearch = { ...defaults, search: { provider: 'none' as const, parcel: false } };
    expect(connectSources(noSearch)).toEqual(["'self'", 'https://services.gugik.gov.pl']);
    const gugik = defaults.modules.gugik!;
    expect(connectSources({ ...noSearch, modules: { gugik: { ...gugik, elevation: false } } })).toEqual([
      "'self'",
      'https://services.gugik.gov.pl',
    ]);
    expect(connectSources({ ...noSearch, modules: { gugik: { ...gugik, elevation: false, address: false } } })).toEqual(["'self'"]);
  });

  it('lists every host the GUGiK search reaches', () => {
    const source = readFileSync('src/modules/gugik/geocoder.ts', 'utf8');
    const hosts = new Set([...source.matchAll(/https:\/\/[a-z0-9.-]+/g)].map((m) => m[0]));
    for (const host of hosts) expect(GUGIK_SEARCH_HOSTS).toContain(host);
  });
});
