import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { GUGIK_SEARCH_HOSTS, connectSources, pickLocale, renderPage, scriptJson } from './html.ts';
import { defaults } from './testSite.ts';

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
  it('takes ?lang=, then the browser preferences, then the default', () => {
    expect(pickLocale(['pl', 'en'], 'pl', 'en', 'pl')).toBe('en');
    expect(pickLocale(['pl', 'en'], 'pl', 'de', 'de-DE,en-GB;q=0.8,pl;q=0.5')).toBe('en');
    expect(pickLocale(['pl', 'en'], 'pl', undefined, 'fr')).toBe('pl');
    expect(pickLocale(['pl'], 'pl')).toBe('pl');
  });
});

describe('renderPage', () => {
  it('puts the language, title, description and configuration into the page', () => {
    const page = renderPage(TEMPLATE, { ...defaults, app: { ...defaults.app, title: 'A & B', description: 'Opis "x"' } });
    expect(page).toContain('<html lang="pl">');
    expect(page).toContain('<title>A &amp; B</title>');
    expect(page).toContain('content="Opis &quot;x&quot;"');
    const boot = /<script type="application\/json" id="boot">(.*)<\/script>/.exec(page)![1];
    expect(JSON.parse(boot)).toEqual({ ...defaults, app: { ...defaults.app, title: 'A & B', description: 'Opis "x"' } });
  });

  it('keeps configuration text from closing its script', () => {
    const json = scriptJson({ text: '</script><script>alert(1)</script>\u2028' });
    expect(json).not.toContain('<');
    expect(JSON.parse(json)).toEqual({ text: '</script><script>alert(1)</script>\u2028' });
  });
});

describe('connections', () => {
  it('opens the first map servers early and allows the GUGiK search hosts only with that search', () => {
    const page = renderPage(TEMPLATE, defaults);
    expect(page).toContain('<link rel="preconnect" href="https://mapy.geoportal.gov.pl" crossorigin />');
    expect(page).toContain('<link rel="preconnect" href="https://integracja.gugik.gov.pl" />');
    expect(connectSources(defaults)).toEqual(["'self'", ...GUGIK_SEARCH_HOSTS]);
    expect(connectSources({ ...defaults, search: { provider: 'none', parcel: false } })).toEqual(["'self'"]);
  });

  it('lists every host the GUGiK search reaches', () => {
    const source = readFileSync('src/services/geocoder.ts', 'utf8');
    const hosts = new Set([...source.matchAll(/https:\/\/[a-z0-9.-]+/g)].map((m) => m[0]));
    for (const host of hosts) expect(GUGIK_SEARCH_HOSTS).toContain(host);
  });
});
