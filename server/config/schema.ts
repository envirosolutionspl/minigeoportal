import { z } from 'zod';
import type { Message } from '../../shared/config.ts';

/**
 * Schema of the configuration directory: app.yaml, map.yaml, layers.yaml. Unknown keys are errors,
 * so a typo never passes silently. Texts are either one string or one string per language.
 * Cross-references (ids used elsewhere) are checked in load.ts.
 */

const id = z.string().regex(/^[\p{L}\p{N}][\p{L}\p{N}_.-]{0,80}$/u, 'letters, digits, _ . - (starting with a letter or digit)');
const locale = z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'a language code such as pl or en-GB');
const url = z.url({ protocol: /^https?$/ });
const text = z.union([z.string().min(1), z.record(locale, z.string().min(1))]);
const point = z.tuple([z.number(), z.number()]);
const extent = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(([a, b, c, d]) => a < c && b < d, 'minX < maxX and minY < maxY');
const scale = z.number().positive();
/**
 * An image of the brand: a path inside the configuration directory (no part starts with a dot, so
 * none leads out of it), served by the app at /brand/<name>.<extension>.
 */
const image = z
  .string()
  .regex(
    /^[a-z0-9_-][a-z0-9_.-]*(\/[a-z0-9_-][a-z0-9_.-]*)*\.(svg|png|webp|jpe?g)$/i,
    'a path of an .svg, .png, .webp or .jpg file inside the configuration directory',
  );

const timeSpec = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('dimension'),
    param: z.string().regex(/^(TIME|DIM_[A-Z0-9_]+)$/i, 'TIME or DIM_<name>'),
    values: z.union([
      z.literal('capabilities'),
      z.array(z.string()).min(1),
      z.strictObject({ start: z.string(), end: z.string(), step: z.string().regex(/^P/, 'an ISO 8601 duration such as P1Y') }),
    ]),
    default: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal('series'),
    editions: z.array(z.strictObject({ value: z.string(), url: url.optional(), layer: z.string().optional() })).min(1),
  }),
]);

export const appSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/, 'lowercase letters, digits and dashes'),
  name: text,
  title: text,
  description: text,
  domain: z.string().min(1),
  contact: z.email(),
  /** The author, linked in the corner of the map; `logo` is shown instead of the name when given. */
  author: z.strictObject({ name: z.string().min(1), url, logo: image.optional() }),
  /** The sign of the app: in the bar, the welcome window, the browser tab and link previews; the built-in one when left out. */
  icon: image.optional(),
  locales: z.strictObject({ default: locale, available: z.array(locale).min(1), root: locale.optional() }),
  /** A line under the name in the welcome window. */
  tagline: text.optional(),
  /** Colours of the interface: skins/<name>/skin.css in the configuration directory or in the app. */
  skin: id.default('default'),
  /**
   * Texts in Markdown, as paths in the configuration directory without the language:
   * content/welcome means content/welcome.pl.md, content/welcome.en.md and so on.
   */
  content: z
    .strictObject({
      welcome: z
        .string()
        .regex(/^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/i, 'a path inside the configuration directory')
        .optional(),
      accessibility: z
        .string()
        .regex(/^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/i, 'a path inside the configuration directory')
        .optional(),
    })
    .default({}),
  links: z.strictObject({ fallbackMap: url.optional(), fallbackName: text.optional() }).default({}),
  report: z.strictObject({
    categories: z.array(z.strictObject({ id, label: text })).min(1),
    /** Language of the report mails; the default language when not given. */
    locale: locale.optional(),
  }),
  search: z
    .strictObject({
      provider: z.enum(['gugik', 'nominatim', 'none']).default('none'),
      parcel: z.boolean().default(false),
      /** The Nominatim server; the public one by default (one request a second for the whole app). */
      nominatim: z
        .strictObject({
          url: url.default('https://nominatim.openstreetmap.org'),
          countryCodes: z.array(z.string().regex(/^[a-z]{2}$/, 'a two-letter country code such as pl')).optional(),
          viewbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
        })
        .default({ url: 'https://nominatim.openstreetmap.org' }),
    })
    .default({ provider: 'none', parcel: false, nominatim: { url: 'https://nominatim.openstreetmap.org' } }),
  modules: z
    .strictObject({
      gugik: z
        .strictObject({
          enabled: z.boolean(),
          catalog: z.boolean().default(true),
          drawOrder: z.boolean().default(true),
          /**
           * The date of the aerial photo under the photo map: `service` is the tile service of map.yaml
           * that shows the photos; `history` the overlay of layers.yaml (with a `time` block) that shows
           * their archive, whose dates the photo index narrows to the ones that exist at a point.
           */
          ortho: z.union([z.literal(false), z.strictObject({ service: id, history: id.optional() })]).default({ service: 'orto' }),
          parcelReport: z.boolean().default(true),
        })
        .optional(),
    })
    .default({}),
});

export const mapSchema = z.strictObject({
  projection: z.strictObject({
    code: z.string().regex(/^EPSG:\d+$/, 'EPSG:<number>'),
    name: z.string().min(1),
    proj4: z.string().optional(),
    axisOrientation: z.enum(['enu', 'neu']).default('enu'),
    extent,
  }),
  zoom: z.strictObject({
    scales: z
      .array(scale)
      .min(2)
      .refine((s) => s.every((v, i) => i === 0 || v < s[i - 1]), 'scales go from the largest denominator to the smallest'),
  }),
  tileGrid: z
    .strictObject({ origin: point, tileSize: z.int().positive(), matrixSet: z.string().min(1), matrixIdPrefix: z.string() })
    .optional(),
  view: z.strictObject({
    center: point,
    zoom: z.number().min(0),
    home: extent,
    homeLabel: text,
    base: id,
    baseMobile: id.optional(),
    /** The base map the large thumbnail switches to (photos) and back from; another than `base` by default. */
    toggleBase: id.optional(),
    overlays: z.array(id).default([]),
  }),
  /** The time view: an overlay with a `time` block, drawn over a base map forced while the view is open. */
  timeTravel: z.strictObject({ layer: id, base: id.optional() }).optional(),
  attribution: text,
  tileServices: z
    .array(
      z.discriminatedUnion('kind', [
        z.strictObject({
          id,
          kind: z.literal('wmts'),
          url,
          layer: z.string().min(1),
          format: z.string().regex(/^image\//),
          firstLevel: z.int().min(0),
          levels: z.int().positive(),
        }),
        z.strictObject({
          id,
          kind: z.literal('xyz'),
          url: url.refine((u) => ['{z}', '{x}', '{y}'].every((p) => decodeURI(u).includes(p)), 'an address with {z}, {x} and {y}'),
          maxZoom: z.int().min(0).optional(),
        }),
      ]),
    )
    .default([]),
  baseMaps: z
    .array(
      z.strictObject({
        id,
        title: text,
        description: text,
        thumb: z.string().optional(),
        sources: z.array(z.strictObject({ service: id, minScale: scale.optional(), maxScale: scale.optional() })),
      }),
    )
    .min(1),
});

export const layersSchema = z.strictObject({
  topics: z.array(z.strictObject({ id, title: text })).min(1),
  drawOrder: z.array(id).optional(),
  overlays: z
    .array(
      z.strictObject({
        id,
        kind: z.enum(['wms', 'wmts', 'rest']),
        url,
        title: text,
        description: text,
        topic: id,
        keywords: z.union([z.array(z.string()), z.record(locale, z.array(z.string()))]).default([]),
        starter: z.boolean().optional(),
        catalogId: z.string().optional(),
        opacity: z.number().min(0).max(1).optional(),
        attribution: text.optional(),
        /** Image format a WMS is asked for: image/png (the default, transparent) or image/jpeg (smaller, opaque). */
        format: z.enum(['image/png', 'image/jpeg']).optional(),
        sublayers: z
          .array(z.strictObject({ name: z.string().min(1), title: text, default: z.boolean().optional(), legend: url.optional() }))
          .min(1),
        time: timeSpec.optional(),
      }),
    )
    .default([]),
});

export type AppFile = z.infer<typeof appSchema>;
export type MapFile = z.infer<typeof mapSchema>;
export type LayersFile = z.infer<typeof layersSchema>;
export type Text = z.infer<typeof text>;

/** An image of the brand as the server sends it. */
export interface BrandImage {
  /** Where the app serves it, e.g. /brand/logo.svg. */
  path: string;
  /** Start of the file's SHA-256: the address changes with the file, so browsers may keep it for good. */
  version: string;
  type: string;
  body: Uint8Array<ArrayBuffer>;
}

/** The whole configuration directory, validated. */
export interface AppConfig {
  dir: string;
  app: AppFile;
  map: MapFile;
  layers: LayersFile;
  /** Markdown of each text in each language that has it (the default language always does). */
  content: Partial<Record<keyof AppFile['content'], Record<string, string>>>;
  /** The stylesheet of the skin. */
  skin: string;
  /** Images of the brand (app.yaml author.logo, icon), read once and served from memory. */
  brand: Partial<Record<'logo' | 'icon', BrandImage>>;
  /** Texts of the interface per language, complete (server/config/messages.ts). */
  messages: Record<string, Record<string, Message>>;
}
