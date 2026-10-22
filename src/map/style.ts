import { asArray, type Color } from 'ol/color';

/**
 * Colours of map markings, from the skin (skins/<name>/skin.css), read once when the map loads:
 * OpenLayers styles take colour values, not CSS variables. Without a skin on the page (tests) the
 * default colours apply.
 */
const skinColor = (name: string, fallback: string) =>
  (typeof document !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue(name).trim()) || fallback;

/** Found objects, the clicked place, the print frame. */
export const HIGHLIGHT = skinColor('--highlight', '#ff8142');
/** Measured lines and areas. */
export const MEASURE = skinColor('--map-measure', '#466946');

/** The colour with the given opacity, for fills. */
export const translucent = (color: string, alpha: number): Color => {
  const [r, g, b] = asArray(color);
  return [r, g, b, alpha];
};
