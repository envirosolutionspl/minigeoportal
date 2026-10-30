import type { Context, Hono } from 'hono';
import { compress } from 'hono/compress';
import { etag } from 'hono/etag';
import { pagePath, textIn } from './config/client.ts';
import { escapeHtml, renderMarkdown } from './config/markdown.ts';
import type { AppConfig } from './config/schema.ts';
import { messageOf } from './config/messages.ts';

/**
 * Help pages (app.yaml guides): plain pages the server renders from Markdown once, so search
 * engines read them without running the app, each with a way into the map and to the other
 * pages; and /sitemap.xml and /robots.txt, which point search engines to them.
 */

interface Guide {
  locale: string;
  /** The page's address, e.g. /pomoc/czy-dzialka-jest-budowlana. */
  path: string;
  /** The first heading of the text. */
  title: string;
  /** The first paragraph, as plain text, for search results. */
  description: string;
  html: string;
}

/** Longest description search engines show in full. */
const DESCRIPTION = 160;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/** The text of rendered Markdown, the entities marked writes read back. */
const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => ENTITIES[name])
    .replace(/\s+/g, ' ')
    .trim();

const shorten = (text: string) => (text.length > DESCRIPTION ? `${text.slice(0, DESCRIPTION - 1).replace(/\s+\S*$/, '')}…` : text);

/** The address of the list of help pages in a language, e.g. /pomoc or /en/help. */
function listPath(config: AppConfig, locale: string): string {
  const { path } = config.app.guides!;
  const { locales } = config.app;
  return `${pagePath(locales, locale)}${typeof path === 'string' ? path : textIn(path, locale, locales.default)}`;
}

/** Every help page in every language that has it, in the order of app.yaml. */
export function guidesOf(config: AppConfig): Guide[] {
  if (!config.app.guides) return [];
  return config.app.guides.pages.flatMap((page) =>
    Object.entries(config.guides[page] ?? {}).map(([locale, markdown]) => {
      const html = renderMarkdown(markdown);
      return {
        locale,
        path: `${listPath(config, locale)}/${page}`,
        title: plain(/<h1>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? page),
        description: shorten(plain(/<p>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '')),
        html,
      };
    }),
  );
}

/** Styles of the help pages, on top of the skin's colours. */
const STYLE = `
  body { margin: 0; background: var(--field); color: var(--text); font: 1rem/1.6 system-ui, sans-serif; }
  header, main, footer { max-width: 44rem; margin: 0 auto; padding: 1rem; }
  .brand { display: inline-flex; align-items: center; gap: 0.6rem; color: var(--text); text-decoration: none; font-size: 1.1rem; letter-spacing: -0.01em; }
  .brand svg, .brand img { width: 2.25rem; height: 2.25rem; }
  .brand b { color: var(--accent); }
  main { background: var(--surface); border-radius: 1rem; padding: 1.5rem; }
  h1 { font-size: 1.6rem; line-height: 1.25; margin-top: 0; }
  h2 { font-size: 1.2rem; margin-top: 2rem; }
  a { color: var(--accent); }
  blockquote { margin: 1rem 0; padding: 0.75rem 1rem; background: var(--field); border-radius: 0.75rem; }
  blockquote > p { margin: 0; }
  .map { display: inline-block; margin: 1rem 0; padding: 0.6rem 1rem; border-radius: 0.75rem; background: var(--accent); color: var(--on-accent); font-weight: 600; text-decoration: none; }
  footer { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; color: var(--muted); font-size: 0.875rem; }
  /* The author's logo keeps its colours on a white plate, as in the corner of the map. */
  footer a { display: inline-flex; padding: 0.25rem 0.5rem; border-radius: 0.6rem; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 0.15); }
  footer img { height: 2.25rem; }
`;

/**
 * The sign of the app as the map draws it (src/ui/Brand.tsx, BrandMark), in the skin's colours: the
 * configuration's own icon, or the magnifying glass over parcel boundaries.
 */
function mark(config: AppConfig): string {
  const { icon } = config.brand;
  if (icon) return `<img src="${escapeHtml(`${icon.path}?v=${icon.version}`)}" alt="" />`;
  return `<svg viewBox="0 0 104 104" aria-hidden="true"><rect width="104" height="104" rx="22" fill="var(--mark, var(--accent))" /><circle cx="46" cy="46" r="19" fill="#f2f4f5" /><path d="M28.6 41.3 62.9 39.8M41.3 28.6 42.9 63.7M29.1 52.2 63.4 50.7M50.7 28.6V63.4" fill="none" stroke="var(--mark-line, var(--muted))" stroke-width="2.5" /><path d="M42.6 40.9 50.7 40.5V50.9L42.8 51.3Z" fill="var(--highlight)" /><circle cx="46" cy="46" r="21" fill="none" stroke="#fff" stroke-width="6" /><path d="M62 62 79 79" stroke="#fff" stroke-width="10" stroke-linecap="round" /></svg>`;
}

/** The name as the map writes it: the last word, or in a one-word name its last capitalised part, in the accent colour. */
function wordmark(name: string): string {
  const last = name.includes(' ') ? name.slice(name.lastIndexOf(' ') + 1) : (/\p{Lu}\P{Lu}*$/u.exec(name)?.[0] ?? name);
  return `<span>${escapeHtml(name.slice(0, name.length - last.length))}<b>${escapeHtml(last)}</b></span>`;
}

function document(config: AppConfig, locale: string, path: string, title: string, description: string, body: string): string {
  const e = escapeHtml;
  const name = textIn(config.app.name, locale, config.app.locales.default);
  const site = `https://${e(config.app.domain)}`;
  const { author } = config.app;
  const logo = config.brand.logo;
  const credit = `${e(messageOf(config.messages[locale], 'brand.madeBy'))} <a href="${e(author.url)}">${
    logo ? `<img src="${e(`${logo.path}?v=${logo.version}`)}" alt="${e(author.name)}" />` : e(author.name)
  }</a>`;
  // The skin cannot end its own element early: in CSS "<\/" reads as "</".
  const skin = config.skin.replace(/<\//g, '<\\/');
  return `<!doctype html>
<html lang="${e(locale)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${e(title)} – ${e(name)}</title>
    <meta name="description" content="${e(description)}" />
    <link rel="canonical" href="${site}${e(path)}" />
    <link rel="icon" href="${e(config.brand.icon ? `${config.brand.icon.path}?v=${config.brand.icon.version}` : '/favicon.svg')}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${e(title)}" />
    <meta property="og:description" content="${e(description)}" />
    <meta property="og:url" content="${site}${e(path)}" />
    <style>${skin}${STYLE}</style>
  </head>
  <body>
    <header><a class="brand" href="${e(pagePath(config.app.locales, locale))}">${mark(config)}${wordmark(name)}</a></header>
    <main>
${body}
    </main>
    <footer>${credit}</footer>
  </body>
</html>
`;
}

const list = (guides: Guide[]) =>
  `<ul>${guides.map((g) => `<li><a href="${escapeHtml(g.path)}">${escapeHtml(g.title)}</a></li>`).join('')}</ul>`;

/** The routes of the help pages, the list of them per language, /sitemap.xml and /robots.txt. */
export function attachGuides(app: Hono, config: AppConfig): void {
  const guides = guidesOf(config);
  const { locales, domain } = config.app;
  const site = `https://${domain}`;
  const html = (body: string) => (c: Context) => {
    c.header('Cache-Control', 'public, max-age=3600');
    return c.html(body);
  };

  const lists: string[] = [];
  for (const locale of new Set(guides.map((g) => g.locale))) {
    const own = guides.filter((g) => g.locale === locale);
    const map = `<a class="map" href="${escapeHtml(pagePath(locales, locale))}">${escapeHtml(messageOf(config.messages[locale], 'guides.openMap'))}</a>`;
    for (const g of own) {
      const others = own.filter((o) => o !== g);
      const more = others.length ? `<h2>${escapeHtml(messageOf(config.messages[locale], 'guides.more'))}</h2>${list(others)}` : '';
      app.get(g.path, compress(), etag(), html(document(config, locale, g.path, g.title, g.description, `${g.html}${map}${more}`)));
    }
    const path = listPath(config, locale);
    const title = messageOf(config.messages[locale], 'guides.title');
    lists.push(path);
    app.get(
      path,
      compress(),
      etag(),
      html(document(config, locale, path, title, own.map((g) => g.title).join(' · '), `<h1>${escapeHtml(title)}</h1>${list(own)}${map}`)),
    );
  }

  const addresses = [...locales.available.map((l) => pagePath(locales, l)), ...lists, ...guides.map((g) => g.path)];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${addresses.map((p) => `  <url><loc>${escapeHtml(site + p)}</loc></url>`).join('\n')}
</urlset>
`;
  app.get('/sitemap.xml', (c) => {
    c.header('Cache-Control', 'public, max-age=3600');
    return c.body(sitemap, 200, { 'Content-Type': 'application/xml; charset=utf-8' });
  });
  app.get('/robots.txt', (c) => {
    c.header('Cache-Control', 'public, max-age=86400');
    return c.text(`User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
  });
}
