import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { SearchProvider } from '@/search/provider';
import * as gugik from './gugik';

/**
 * Optional modules as the app reaches them: the only file of the app that imports a module.
 * What app.yaml enables (config.modules, config.search) decides which parts exist, and each
 * part loads on its own, so a deployment without a module never downloads its code.
 */

/** A part of the place panel, for the clicked point in the map's coordinates. */
export type InfoPart = ComponentType<{ coordinate: [number, number] }>;

/** A search of its own next to the search box, opened by a button. */
export interface SearchTool {
  label: string;
  /** Text of the button on wider screens. */
  short: string;
  icon: LucideIcon;
  Panel: ComponentType<{ onClose(): void }>;
}

/** The search providers by app.yaml search.provider; `none` finds coordinates only. */
export const searchProviders: Record<string, () => Promise<SearchProvider>> = {
  gugik: gugik.searchProvider,
  nominatim: () => import('@/search/nominatim').then((m) => m.nominatimSearch),
};

export const searchTool: SearchTool | undefined = gugik.parcelTool;

/**
 * A date the time view can show at a place, with a detail to say after it (the photo's
 * sharpness, the sheets' scales) and, for a series, the sublayers that draw it (comma-separated).
 */
export interface TimeOption {
  value: string;
  detail?: string;
  layer?: string;
}

/** Asks for the dates a layer has at a point. */
export type TimeOptionsAt = (coordinate: [number, number], signal: AbortSignal) => Promise<TimeOption[]>;

/**
 * The dates a layer of the time view has at a point, from a module that knows them (the photo
 * index of the gugik module for the archival photos); for a layer no module knows, the view
 * offers the layer's own values.
 */
export const timeOptions: (layer: string) => TimeOptionsAt | undefined = gugik.timeOptions;

/** Under the coordinates in the header of the place panel. */
export const infoHeader: InfoPart[] = [...gugik.infoHeader];

/** Between the results and the footer of the place panel. */
export const infoFooter: InfoPart[] = [...gugik.infoFooter];
