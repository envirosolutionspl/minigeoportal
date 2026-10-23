import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { flatten } from '../../server/config/messages.ts';
import type { Message } from '../../shared/config';
import { t } from './index';

/** The app's own texts (i18n/) and those of each module (src/modules/<module>/i18n/). */
const SETS = ['i18n', 'src/modules/gugik/i18n'];

const read = (dir: string, locale: string) => {
  const problems: string[] = [];
  const messages = flatten(parse(readFileSync(`${dir}/${locale}.yaml`, 'utf8')), problems, locale);
  expect(problems).toEqual([]);
  return messages;
};
const core = read('i18n', 'pl');
const pl = Object.assign({}, ...SETS.map((dir) => read(dir, 'pl'))) as Record<string, Message>;
const languages = (dir: string) => readdirSync(dir).map((f) => f.replace(/\.yaml$/, ''));

/** Source files of the app, without tests. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [path] : [];
  });
}
const code = sources('src')
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const placeholders = (message: Message) =>
  [...new Set(Object.values(typeof message === 'string' ? { other: message } : message).flatMap((m) => m.match(/\{\w+\}/g) ?? []))].sort();

describe('texts of the interface', () => {
  it('has every key the app asks for', () => {
    const keys = [...code.matchAll(/\bt\(\s*'([\w.]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(100);
    expect(keys.filter((k) => !(k in pl))).toEqual([]);
    // Keys put together in the code (layers.status.ok …) have their family in the file.
    for (const [, prefix] of code.matchAll(/\bt\(\s*`([\w.]+)\.\$\{/g)) {
      expect(
        Object.keys(pl).some((k) => k.startsWith(`${prefix}.`)),
        prefix,
      ).toBe(true);
    }
  });

  it.each(SETS.flatMap((dir) => languages(dir).map((l) => [dir, l])))(
    'has the same keys and placeholders in %s/%s.yaml as in Polish',
    (dir, locale) => {
      const polish = read(dir, 'pl');
      const other = read(dir, locale);
      expect(Object.keys(other).sort()).toEqual(Object.keys(polish).sort());
      for (const key of Object.keys(polish)) expect(placeholders(other[key]), key).toEqual(placeholders(polish[key]));
    },
  );

  it('keeps the texts of a module apart from those of the app, which name no GUGiK service', () => {
    const module = read('src/modules/gugik/i18n', 'pl');
    expect(Object.keys(module).filter((k) => k in core)).toEqual([]);
    expect(
      Object.values(core)
        .flatMap((m) => (typeof m === 'string' ? [m] : Object.values(m)))
        .filter((m) => /GUGiK|geoportal|działk/i.test(m)),
    ).toEqual([]);
  });

  it('fills in values, writes numbers the way the language does and picks the plural form', () => {
    expect(t('layers.onlyActive', { count: 12000 })).toMatch(/^Tylko włączone \(12\s000\)$/);
    expect(t('parcel.several', { count: 2 })).toBe('Znaleziono 2 działki o tym numerze. Wybierz jedną.');
    expect(t('parcel.several', { count: 5 })).toBe('Znaleziono 5 działek o tym numerze. Wybierz jedną.');
    expect(t('no.such.key')).toBe('no.such.key');
  });
});
