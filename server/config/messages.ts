import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Message } from '../../shared/config.ts';

/**
 * Texts of the interface per language: i18n/<lang>.yaml of the app, with changes and new
 * languages from i18n/<lang>.yaml in the configuration directory. Keys are nested in the files
 * and dotted in the app (search.placeholder). A message with forms per number is an object of
 * Intl.PluralRules categories: { one: 1 warstwa, few: '{count} warstwy', many: …, other: … }.
 * A key a language lacks falls back to the default language.
 */

const BUILT_IN = resolve(dirname(fileURLToPath(import.meta.url)), '../../i18n');
const PLURAL = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

type Tree = { [key: string]: string | Tree };

const isPlural = (value: Tree) => Object.keys(value).every((k) => PLURAL.has(k)) && 'other' in value;

/** Dotted keys of a nested message file; `problems` gets every value that is not a text. */
export function flatten(tree: unknown, problems: string[], file: string, prefix = ''): Record<string, Message> {
  const out: Record<string, Message> = {};
  if (!tree || typeof tree !== 'object') return out;
  for (const [key, value] of Object.entries(tree as Tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else if (value && typeof value === 'object' && isPlural(value) && Object.values(value).every((v) => typeof v === 'string'))
      out[path] = value as Record<string, string>;
    else if (value && typeof value === 'object') Object.assign(out, flatten(value, problems, file, path));
    else problems.push(`${file} ${path}: a text, or texts per number (one, few, many, other)`);
  }
  return out;
}

function readMessages(file: string, problems: string[], required: boolean): Record<string, Message> {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    if (required) problems.push(`${file}: file not found`);
    return {};
  }
  try {
    return flatten(parse(source), problems, file);
  } catch (e) {
    problems.push(`${file}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return {};
  }
}

/** Messages of every language, complete: what a language lacks comes from the default one. */
export function loadMessages(configDir: string, locales: { default: string; available: string[] }, problems: string[]) {
  const of = (locale: string) => {
    const builtIn = readMessages(join(BUILT_IN, `${locale}.yaml`), problems, false);
    const own = readMessages(join(configDir, 'i18n', `${locale}.yaml`), problems, false);
    return { ...builtIn, ...own };
  };
  const fallback = of(locales.default);
  if (Object.keys(fallback).length === 0) problems.push(`i18n/${locales.default}.yaml: no texts for the default language`);
  return Object.fromEntries(locales.available.map((l) => [l, l === locales.default ? fallback : { ...fallback, ...of(l) }]));
}
