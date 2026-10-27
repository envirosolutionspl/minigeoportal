import type { HtmlTagDescriptor, Rollup } from 'vite';

/**
 * Links that start downloads the page needs before its scripts ask for them. Vite preloads only
 * what the entry imports at once; the map library and the app are imported once the configuration
 * is read (main.tsx), so without a link they wait for the first scripts to run. The fonts are
 * asked for only once the stylesheet applies and text set in them is laid out, so they come late
 * and the text is drawn twice.
 */

/** Chunks the first screen runs (vite.config.ts: manualChunks, main.tsx: import('./App')), in the order they are needed. */
const CHUNKS = ['ol', 'App'];
/** The subsets of the font the page is set in (index.css); the others cover other alphabets. */
const FONT = /-latin(-ext)?-[^/]*\.woff2$/;

type File = Pick<Rollup.OutputChunk, 'type' | 'fileName' | 'name'> | Pick<Rollup.OutputAsset, 'type' | 'fileName'>;

export function preloadTags(bundle: Record<string, File>, base = '/'): HtmlTagDescriptor[] {
  const files = Object.values(bundle);
  const chunks = CHUNKS.flatMap((name) => files.filter((f) => f.type === 'chunk' && f.name === name));
  const fonts = files.filter((f) => f.type === 'asset' && FONT.test(f.fileName));
  return [
    ...chunks.map((f) => ({
      tag: 'link',
      attrs: { rel: 'modulepreload', crossorigin: true, href: `${base}${f.fileName}` },
      injectTo: 'head' as const,
    })),
    ...fonts.map((f) => ({
      tag: 'link',
      attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true, href: `${base}${f.fileName}` },
      injectTo: 'head' as const,
    })),
  ];
}
