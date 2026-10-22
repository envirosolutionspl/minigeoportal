import type { ClientConfig } from '../shared/config.ts';
import { clientConfig, escapeHtml } from './config/client.ts';
import type { AppConfig } from './config/schema.ts';

/**
 * The page and the configuration the app starts with. The configuration goes into index.html as
 * JSON, so the app starts without waiting for one more request; /api/config gives the same.
 */

/** The visitor's language: ?lang=, then the browser's preferences, then the default. */
export function pickLocale(available: string[], fallback: string, query?: string, acceptLanguage?: string): string {
  if (query && available.includes(query)) return query;
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

/** index.html for one language: its lang, title and description, and the configuration inside. */
export function renderPage(template: string, client: ClientConfig): string {
  return template
    .replace(/<html lang="[^"]*">/, `<html lang="${escapeHtml(client.locale)}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(client.app.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*"/, `$1${escapeHtml(client.app.description)}"`)
    .replace('</head>', `  <script type="application/json" id="boot">${scriptJson(client)}</script>\n  </head>`);
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
    locale: (query?: string, acceptLanguage?: string) => pickLocale(available, fallback, query, acceptLanguage),
    client: (locale: string) => clients.get(locale) ?? clients.get(fallback)!,
  };
}

export type Site = ReturnType<typeof createSite>;
