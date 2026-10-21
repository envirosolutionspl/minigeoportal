/** Lower case without Polish diacritics, for matching what people type; ł has no decomposed form. */
export const normalize = (s: string) =>
  s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
