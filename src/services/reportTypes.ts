/** The bug report form, as the app shows it and the server checks it. */
export const CATEGORIES = {
  mapa: 'Mapa lub warstwy',
  wyszukiwanie: 'Wyszukiwanie',
  dzialki: 'Działki i informacje o miejscu',
  dostepnosc: 'Dostępność',
  inne: 'Inne',
} as const;

export type Category = keyof typeof CATEGORIES;

/** Length of the message, in characters. */
export const MESSAGE = { min: 10, max: 3000 };
/** Longest address a mail system accepts. */
export const EMAIL_MAX = 254;
