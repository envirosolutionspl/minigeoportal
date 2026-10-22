import { z } from 'zod';

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
  author: z.strictObject({ name: z.string().min(1), url }),
  locales: z.strictObject({ default: locale, available: z.array(locale).min(1) }),
  links: z.strictObject({ fallbackMap: url.optional() }).default({}),
  report: z.strictObject({
    categories: z.array(z.strictObject({ id, label: text })).min(1),
  }),
  search: z
    .strictObject({
      provider: z.enum(['gugik', 'nominatim', 'none']).default('none'),
      parcel: z.boolean().default(false),
    })
    .default({ provider: 'none', parcel: false }),
  modules: z
    .strictObject({
      gugik: z
        .strictObject({
          enabled: z.boolean(),
          catalog: z.boolean().default(true),
          drawOrder: z.boolean().default(true),
          ortho: z.boolean().default(true),
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
  tileGrid: z.strictObject({ origin: point, tileSize: z.int().positive(), matrixIdPrefix: z.string() }).optional(),
  view: z.strictObject({
    center: point,
    zoom: z.number().min(0),
    home: extent,
    homeLabel: text,
    base: id,
    baseMobile: id.optional(),
    overlays: z.array(id).default([]),
  }),
  attribution: text,
  tileServices: z
    .array(
      z.strictObject({
        id,
        kind: z.literal('wmts'),
        url,
        layer: z.string().min(1),
        format: z.string().regex(/^image\//),
        firstLevel: z.int().min(0),
        levels: z.int().positive(),
      }),
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

/** The whole configuration directory, validated. */
export interface AppConfig {
  dir: string;
  app: AppFile;
  map: MapFile;
  layers: LayersFile;
}
