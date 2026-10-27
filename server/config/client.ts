import type { ClientConfig } from '../../shared/config.ts';
import type { AppConfig, BrandImage, Text } from './schema.ts';
import { escapeHtml, renderMarkdown } from './markdown.ts';

/**
 * The configuration the app receives: every text resolved to one language, only the fields the
 * app needs (no file paths, no server settings). Built once per language when the server starts.
 */

/**
 * Address of the page in a language: /en/, /de/; the language of locales.root, and the only one
 * of a deployment with one language, at the bare address /.
 */
export const pagePath = (locales: { available: string[]; root?: string }, locale: string) =>
  locales.available.length === 1 || locale === locales.root ? '/' : `/${locale}/`;

/** Text in `locale`, else in the default language, else the first one given. */
export function textIn(value: Text, locale: string, fallback: string): string {
  if (typeof value === 'string') return value;
  return value[locale] ?? value[fallback] ?? Object.values(value)[0];
}

/**
 * A credit line with Markdown links ([text](https://…)) as HTML. Everything else is escaped, and
 * links may only lead to http(s) addresses.
 */
export function creditHtml(markdown: string): string {
  return escapeHtml(markdown).replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label: string, href: string) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`,
  );
}

/** Address of a brand image: changes with the file, so it may be cached for good. */
const brandUrl = (image: BrandImage) => `${image.path}?v=${image.version}`;

export function clientConfig({ app, map, layers, content, brand, messages }: AppConfig, locale: string): ClientConfig {
  const fallback = app.locales.default;
  const t = (value: Text) => textIn(value, locale, fallback);
  const keywords = (k: string[] | Record<string, string[]>) => (Array.isArray(k) ? k : (k[locale] ?? k[fallback] ?? []));

  return {
    app: {
      id: app.id,
      name: t(app.name),
      title: t(app.title),
      description: t(app.description),
      domain: app.domain,
      contact: app.contact,
      author: { name: app.author.name, url: app.author.url, ...(brand.logo ? { logo: brandUrl(brand.logo) } : {}) },
      ...(brand.icon ? { icon: brandUrl(brand.icon) } : {}),
      storagePrefix: `${app.id}.`,
      ...(app.tagline ? { tagline: t(app.tagline) } : {}),
    },
    content: Object.fromEntries(Object.entries(content).map(([name, texts]) => [name, renderMarkdown(texts[locale] ?? texts[fallback])])),
    locale,
    locales: app.locales.available,
    localePaths: Object.fromEntries(app.locales.available.map((l) => [l, pagePath(app.locales, l)])),
    messages: messages[locale],
    map: {
      projection: map.projection,
      scales: map.zoom.scales,
      ...(map.tileGrid ? { tileGrid: map.tileGrid } : {}),
      view: {
        center: map.view.center,
        zoom: map.view.zoom,
        home: map.view.home,
        homeLabel: t(map.view.homeLabel),
        base: map.view.base,
        ...(map.view.baseMobile ? { baseMobile: map.view.baseMobile } : {}),
        ...(map.view.toggleBase ? { toggleBase: map.view.toggleBase } : {}),
        overlays: map.view.overlays,
      },
      attribution: creditHtml(t(map.attribution)),
      slowLoad: map.slowLoad,
      tileServices: map.tileServices,
      ...(map.timeTravel
        ? {
            timeTravel: {
              layers: map.timeTravel.layers.map((l) => ({ id: l.id, label: t(l.label), ...(l.base ? { base: l.base } : {}) })),
              base: map.timeTravel.base,
            },
          }
        : {}),
      baseMaps: map.baseMaps.map((b) => ({
        id: b.id,
        title: t(b.title),
        description: t(b.description),
        sources: b.sources,
        ...(b.thumb ? { thumb: b.thumb } : {}),
      })),
    },
    layers: {
      topics: layers.topics.map((topic) => ({ id: topic.id, title: t(topic.title) })),
      overlays: layers.overlays.map((o) => ({
        id: o.id,
        kind: o.kind,
        title: t(o.title),
        description: t(o.description),
        topic: o.topic,
        keywords: keywords(o.keywords),
        ...(o.starter ? { starter: true } : {}),
        url: o.url,
        ...(o.catalogId ? { catalogId: o.catalogId } : {}),
        sublayers: o.sublayers.map((l) => ({
          name: l.name,
          title: t(l.title),
          ...(l.default ? { default: true } : {}),
          ...(l.legend ? { legend: l.legend } : {}),
        })),
        ...(o.opacity !== undefined ? { opacity: o.opacity } : {}),
        ...(o.attribution ? { attribution: creditHtml(t(o.attribution)) } : {}),
        ...(o.format ? { format: o.format } : {}),
        ...(o.time
          ? {
              time:
                o.time.type === 'series'
                  ? { ...o.time, editions: o.time.editions.map(({ label, ...e }) => ({ ...e, ...(label ? { label: t(label) } : {}) })) }
                  : o.time,
            }
          : {}),
      })),
      drawOrder: layers.drawOrder ?? layers.overlays.map((o) => o.id),
    },
    search: { provider: app.search.provider, parcel: app.search.parcel },
    links: app.links.fallbackMap
      ? {
          fallbackMap: {
            url: app.links.fallbackMap,
            // Without a name the link is called after its host: mapy.example.org.
            name: app.links.fallbackName ? t(app.links.fallbackName) : new URL(app.links.fallbackMap).hostname.replace(/^www\./, ''),
          },
        }
      : {},
    report: { categories: app.report.categories.map((c) => ({ id: c.id, label: t(c.label) })) },
    modules: app.modules.gugik?.enabled
      ? {
          gugik: {
            catalog: app.modules.gugik.catalog,
            drawOrder: app.modules.gugik.drawOrder,
            ortho: app.modules.gugik.ortho,
            topo: app.modules.gugik.topo,
            parcelReport: app.modules.gugik.parcelReport,
            elevation: app.modules.gugik.elevation,
          },
        }
      : {},
  };
}
