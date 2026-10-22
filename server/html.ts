import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { ClientConfig } from '../shared/config.ts';
import { clientConfig } from './config/client.ts';
import { escapeHtml } from './config/markdown.ts';
import type { AppConfig } from './config/schema.ts';

/**
 * The page and the configuration the app starts with. The configuration goes into index.html as
 * JSON, so the app starts without waiting for one more request; /api/config gives the same.
 */

/**
 * The visitor's language: the one chosen (?lang=, then the cookie the language switch sets),
 * then the browser's preferences, then the default.
 */
export function pickLocale(available: string[], fallback: string, chosen: (string | undefined)[] = [], acceptLanguage?: string): string {
  const own = chosen.find((l) => l && available.includes(l));
  if (own) return own;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    const match = available.find((l) => l.toLowerCase() === tag) ?? available.find((l) => l.toLowerCase() === tag.split('-')[0]);
    if (match) return match;
  }
  return fallback;
}

/** JSON that cannot end its <script> early: no "<" survives, nor the line separators old parsers choke on. */
export const scriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** Hosts the GUGiK search reaches from the browser (src/modules/gugik/geocoder.ts). */
export const GUGIK_SEARCH_HOSTS = [
  'https://services.gugik.gov.pl',
  'https://uldk.gugik.gov.pl',
  'https://capap.gugik.gov.pl',
  'https://mapy.geoportal.gov.pl',
];

/** Where the page may fetch from (CSP connect-src): itself, and the services its search queries directly. */
export function connectSources(client: ClientConfig): string[] {
  return ["'self'", ...(client.search.provider === 'gugik' || client.search.parcel ? GUGIK_SEARCH_HOSTS : [])];
}

/**
 * Connections opened while the page loads, for the first map: tile servers of the first base maps
 * (tiles are read with CORS) and servers of the overlays switched on at the start.
 */
function preconnects(client: ClientConfig): string {
  const { view, baseMaps, tileServices } = client.map;
  const firstBases = baseMaps.filter((b) => b.id === view.base || b.id === view.baseMobile);
  const tiles = firstBases.flatMap((b) => b.sources.flatMap((s) => tileServices.find((t) => t.id === s.service)?.url ?? []));
  const images = client.layers.overlays.filter((o) => view.overlays.includes(o.id)).map((o) => o.url);
  const links = new Set([
    ...tiles.map((u) => `<link rel="preconnect" href="${escapeHtml(new URL(u).origin)}" crossorigin />`),
    ...images.map((u) => `<link rel="preconnect" href="${escapeHtml(new URL(u).origin)}" />`),
  ]);
  return [...links].map((l) => `    ${l}\n`).join('');
}

/**
 * The address search engines should keep for the page, and what a shared link shows (Open
 * Graph): name, title, description and the app's icon.
 */
function sharing(client: ClientConfig): string {
  const e = escapeHtml;
  const { name, title, description, domain } = client.app;
  const site = `https://${e(domain)}`;
  const tags = [
    `<link rel="canonical" href="${site}/" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${e(name)}" />`,
    `<meta property="og:title" content="${e(title)}" />`,
    `<meta property="og:description" content="${e(description)}" />`,
    `<meta property="og:url" content="${site}/" />`,
    `<meta property="og:image" content="${site}/apple-touch-icon.png" />`,
    `<meta property="og:locale" content="${e(client.locale)}" />`,
    `<meta name="twitter:card" content="summary" />`,
  ];
  return tags.map((t) => `    ${t}\n`).join('');
}

/**
 * index.html for one language: its lang, title and description, links for search engines and
 * sharing, the skin's colours and the configuration inside.
 */
export function renderPage(template: string, client: ClientConfig, skin = ''): string {
  // The stylesheet comes from the configuration; it cannot end its own element early.
  // In CSS "<\/" reads as "</", so the stylesheet keeps its meaning.
  const style = skin ? `    <style id="skin">${skin.replace(/<\//g, '<\\/')}</style>\n` : '';
  return template
    .replace(/<html lang="[^"]*">/, `<html lang="${escapeHtml(client.locale)}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(client.app.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*"/, `$1${escapeHtml(client.app.description)}"`)
    .replace(
      '</head>',
      `${sharing(client)}${style}${preconnects(client)}    <script type="application/json" id="boot">${scriptJson(client)}</script>\n  </head>`,
    );
}

/** The configuration for each language, built once. */
export function createSite(config: AppConfig) {
  const { default: fallback, available } = config.app.locales;
  const clients = new Map(available.map((l) => [l, clientConfig(config, l)]));
  return {
    config,
    /** In the default language: what the server itself uses (layers it may query, mail texts). */
    defaults: clients.get(fallback)!,
    multilingual: available.length > 1,
    /** The language of a request: ?lang=, the lang cookie, Accept-Language. */
    locale: (c?: Context) =>
      pickLocale(available, fallback, c ? [c.req.query('lang'), getCookie(c, 'lang')] : [], c?.req.header('accept-language')),
    client: (locale: string) => clients.get(locale) ?? clients.get(fallback)!,
  };
}

export type Site = ReturnType<typeof createSite>;
