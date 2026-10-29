import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Message } from '../../shared/config.ts';

/**
 * Texts of the interface per language: i18n/<lang>.yaml of the app, those of each enabled module
 * (src/modules/<module>/i18n/<lang>.yaml), then changes and new languages from i18n/<lang>.yaml
 * in the configuration directory. Keys are nested in the files
 * and dotted in the app (search.placeholder). A message with forms per number is an object of
 * Intl.PluralRules categories: { one: 1 warstwa, few: '{count} warstwy', many: …, other: … }.
 * A key a language lacks falls back to the default language.
 */

const BUILT_IN = resolve(dirname(fileURLToPath(import.meta.url)), '../../i18n');
const MODULES = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/modules');
const PLURAL = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

type Tree = { [key: string]: string | Tree };

const isPlural = (value: Tree) => Object.keys(value).every((k) => PLURAL.has(k)) && 'other' in value;

/** A message of one language as the server says it (mails, help pages), its {parameters} filled in; the key when there is none. */
export const messageOf = (messages: Record<string, Message> | undefined, key: string, params: Record<string, string> = {}) =>
  String(messages?.[key] ?? key).replace(/\{(\w+)\}/g, (all, name: string) => params[name] ?? all);

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

/** Keys the app makes up as it goes (readable names of the attributes a service answers with): a deployment adds them freely. */
const OPEN = ['info.fields.'];

/** Messages of every language, complete: what a language lacks comes from the default one. */
export function loadMessages(
  configDir: string,
  locales: { default: string; available: string[] },
  problems: string[],
  modules: string[] = [],
) {
  /** The app's own texts: the built-in file and those of the enabled modules. */
  const own = (locale: string) =>
    Object.assign(
      {},
      ...[join(BUILT_IN, `${locale}.yaml`), ...modules.map((m) => join(MODULES, m, 'i18n', `${locale}.yaml`))].map((f) =>
        readMessages(f, problems, false),
      ),
    ) as Record<string, Message>;
  const base = own(locales.default);
  const of = (locale: string) => {
    const texts = locale === locales.default ? base : own(locale);
    const file = join(configDir, 'i18n', `${locale}.yaml`);
    const changes = readMessages(file, problems, false);
    // A key the app does not have is a typo, not a new text: the app would never show it.
    for (const key of Object.keys(changes)) {
      if (!(key in base) && !(key in texts) && !OPEN.some((prefix) => key.startsWith(prefix))) {
        problems.push(`${file} ${key}: not a text of the app`);
      }
    }
    return { ...texts, ...changes };
  };
  const fallback = of(locales.default);
  if (Object.keys(fallback).length === 0) problems.push(`i18n/${locales.default}.yaml: no texts for the default language`);
  return Object.fromEntries(locales.available.map((l) => [l, l === locales.default ? fallback : { ...fallback, ...of(l) }]));
}
