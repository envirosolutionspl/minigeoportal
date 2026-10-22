import { describe, expect, it } from 'vitest';
import { pickLocale, renderPage, scriptJson } from './html.ts';
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
