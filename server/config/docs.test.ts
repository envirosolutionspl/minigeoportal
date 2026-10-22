import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { appSchema, layersSchema, mapSchema } from './schema.ts';

type Def = {
  type: string;
  shape?: Record<string, ZodType>;
  innerType?: ZodType;
  element?: ZodType;
  options?: ZodType[];
  items?: ZodType[];
  valueType?: ZodType;
  in?: ZodType;
};

/** Every field name of a schema, nested ones included. */
function fields(schema: ZodType, out = new Set<string>()): Set<string> {
  const def = (schema as unknown as { _zod: { def: Def } })._zod.def;
  for (const [key, inner] of Object.entries(def.shape ?? {})) {
    out.add(key);
    fields(inner, out);
  }
  for (const inner of [def.innerType, def.element, def.valueType, def.in, ...(def.options ?? []), ...(def.items ?? [])]) {
    if (inner) fields(inner, out);
  }
  return out;
}

const all = [...fields(appSchema), ...fields(mapSchema), ...fields(layersSchema)];

describe.each(['en', 'pl'])('documentation in %s', (lang) => {
  const text = readdirSync(join('docs', lang))
    .map((f) => readFileSync(join('docs', lang, f), 'utf8'))
    .join('\n');

  it('describes every field of the configuration', () => {
    expect(all.length).toBeGreaterThan(60);
    expect(all.filter((field) => !text.includes(`\`${field}\``) && !text.includes(`${field}:`))).toEqual([]);
  });
});
