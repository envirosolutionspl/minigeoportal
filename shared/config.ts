/**
 * Configuration as the app receives it: built by the server from the YAML files in the config
 * directory (server/config), with every text already in the visitor's language. Shared by the
 * server, which builds it, and the app, which reads it (src/config/runtime.ts).
 */

/** One layer inside a service, with a title written for non-specialists. */
export interface SubLayer {
  name: string;
  title: string;
  /** Selected when the service is switched on. */
  default?: boolean;
  /** Legend image; without it the legend from the service's capabilities is used. */
  legend?: string;
}

/** A tile service: a building block of base maps. */
export type TileService =
  | {
      id: string;
      kind: 'wmts';
      url: string;
      layer: string;
      format: string;
      /** First level of the map's scale series the service publishes, and how many it publishes. */
      firstLevel: number;
      levels: number;
    }
  | {
      id: string;
      /** Tiles at {z}/{x}/{y} on the standard grid of the map's projection (e.g. OpenStreetMap). */
      kind: 'xyz';
      url: string;
      maxZoom?: number;
    };

/** A tile service inside a base map, drawn only in its scale range. */
export interface BaseSource {
  service: string;
  /** Drawn at scales from 1:minScale (zoomed out at least that far). */
  minScale?: number;
  /** Drawn at scales up to 1:maxScale (zoomed in at least that far). */
  maxScale?: number;
}

/** Base map as people see it: one map, composed of tile services that switch with scale. */
export interface BaseMap {
  id: string;
  title: string;
  description: string;
  sources: BaseSource[];
  /** Small preview image. */
  thumb?: string;
}

/**
 * How a layer changes over time, for a time view: a WMS/WMTS dimension (one service, a value per
 * request) or a series of editions (one service or layer per edition).
 */
export type TimeSpec =
  | {
      type: 'dimension';
      /** Request parameter: TIME, or DIM_<name> for other dimensions. */
      param: string;
      /** Values from the service's capabilities, a list, or a range with an ISO 8601 step. */
      values: 'capabilities' | string[] | { start: string; end: string; step: string };
      /** Value shown first: the newest, or a given one. */
      default?: string;
    }
  | {
      type: 'series';
      /** `label`: what the time bar says for the edition instead of its value (a system of maps and its years). */
      editions: { value: string; url?: string; layer?: string; label?: string }[];
    };

/** Overlay: a map service drawn over the base map, with sublayers to choose from. */
export interface Overlay {
  id: string;
  kind: 'wms' | 'wmts' | 'rest';
  title: string;
  description: string;
  /** Id of a topic of the layer list. */
  topic: string;
  keywords: string[];
  /** Shown in the first group of the layer list. */
  starter?: boolean;
  url: string;
  /** Id of the same layer in an external catalog (e.g. geoportal.gov.pl), whose drawing order it shares. */
  catalogId?: string;
  /** Listed in the order the layer list shows; the drawing order is `layers.drawOrder`. */
  sublayers: SubLayer[];
  opacity?: number;
  /** Source credit as HTML (links only); without it the map's attribution applies. */
  attribution?: string;
  /** Image format a WMS is asked for; image/png (the default) is transparent, image/jpeg smaller. */
  format?: 'image/png' | 'image/jpeg';
  time?: TimeSpec;
}

export interface Topic {
  id: string;
  title: string;
}

export type Extent = [number, number, number, number];

/** A text of the interface, or its forms per number by Intl.PluralRules category (one, few, many, other). */
export type Message = string | Record<string, string>;

export interface ClientConfig {
  app: {
    id: string;
    name: string;
    title: string;
    description: string;
    domain: string;
    contact: string;
    /** `logo`: address of the author's logo; without it the name is shown. */
    author: { name: string; url: string; logo?: string };
    /** Address of the app's sign; without it the built-in one in the skin's colours. */
    icon?: string;
    /** Prefix of everything the app keeps in the browser's storage. */
    storagePrefix: string;
    /** A line under the name in the welcome window. */
    tagline?: string;
  };
  /** Texts of the deployment as HTML made from its Markdown (server/config/markdown.ts). */
  content: { welcome?: string; accessibility?: string };
  locale: string;
  locales: string[];
  /** Address of the page in each language: '/' or '/en/' (server/html.ts pagePath). */
  localePaths: Record<string, string>;
  /** Texts of the interface in `locale`, by dotted key (i18n/<lang>.yaml). */
  messages: Record<string, Message>;
  map: {
    projection: {
      code: string;
      /** Name people know the system by, e.g. PL-1992. */
      name: string;
      proj4?: string;
      axisOrientation: 'enu' | 'neu';
      extent: Extent;
    };
    /** Scale denominators of the zoom levels, largest first. */
    scales: number[];
    /** Tile grid shared by the tile services, used when their capabilities are not cached. */
    tileGrid?: { origin: [number, number]; tileSize: number; matrixSet: string; matrixIdPrefix: string };
    view: {
      center: [number, number];
      zoom: number;
      /** Extent of the "whole area" button and of the first visit. */
      home: Extent;
      homeLabel: string;
      base: string;
      /** Base map on phones, when it differs. */
      baseMobile?: string;
      /** The base map the large thumbnail switches to (photos) and back from. */
      toggleBase?: string;
      overlays: string[];
    };
    /** Source credit of the map as HTML (links only). */
    attribution: string;
    /** Seconds a layer's tile or image may take before the map says the layer loads slowly. */
    slowLoad: number;
    tileServices: TileService[];
    baseMaps: BaseMap[];
    /**
     * The time view: `layers` are overlays with a `time` block, each with the name the bar's
     * switch shows, drawn one at a time at the date chosen on the time bar over a base map forced
     * while the view is open: the layer's own `base` (the present of the same kind: today's
     * photos under old photos, today's map under old maps), else the view's `base`.
     */
    timeTravel?: { layers: { id: string; label: string; base?: string }[]; base?: string };
  };
  layers: {
    topics: Topic[];
    overlays: Overlay[];
    /** Overlay ids, lowest drawn first. */
    drawOrder: string[];
  };
  search: { provider: 'gugik' | 'nominatim' | 'none'; parcel: boolean };
  /** Another map to send people to when a layer cannot be shown here. */
  links: { fallbackMap?: { url: string; name: string } };
  report: { categories: { id: string; label: string }[] };
  modules: {
    /**
     * `ortho.service`: the tile service that shows the aerial photos (map.tileServices);
     * `ortho.history`: the overlay (with a `time` block) that shows their archive, whose dates at
     * a point the photo index narrows down to the ones that exist there.
     */
    gugik?: {
      catalog: boolean;
      drawOrder: boolean;
      ortho: { service: string; history?: string } | false;
      /** `topo.history`: the overlay (a series) of the old topographic maps, whose dates at a point the index of those maps gives. */
      topo: { history: string } | false;
      parcelReport: boolean;
      /** Heights of the terrain (the elevation model) in the place panel and along a measured line. */
      elevation: boolean;
    };
  };
}
