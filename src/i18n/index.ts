import { config } from '@/config/runtime';

/**
 * Texts of the interface in the visitor's language (config.messages, from i18n/<lang>.yaml).
 * t('search.results', { count: 3 }) picks the plural form for the number and fills in {count};
 * numbers are written the way the language writes them.
 */

type Params = Record<string, string | number>;

let rules: Intl.PluralRules | undefined;
let numbers: Intl.NumberFormat | undefined;

export function t(key: string, params?: Params): string {
  const message = config.messages[key];
  if (message === undefined) return key;
  let text: string;
  if (typeof message === 'string') text = message;
  else {
    rules ??= new Intl.PluralRules(config.locale);
    text = message[rules.select(Number(params?.count ?? 0))] ?? message.other;
  }
  if (!params) return text;
  numbers ??= new Intl.NumberFormat(config.locale);
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : typeof value === 'number' ? numbers!.format(value) : value;
  });
}

/** Language of the interface, for Intl formats and sorting. */
export const locale = () => config.locale;
