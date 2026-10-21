/**
 * Registry of GUGiK services used by the app. Each entry drives the map layer,
 * the layer catalog, attribution and the availability probe.
 * Adding a service means adding one entry here.
 */

export type Topic = 'dzialki' | 'planowanie' | 'ceny' | 'uzbrojenie';

export const TOPICS: Record<Topic, string> = {
  dzialki: 'Działki i budynki',
  planowanie: 'Planowanie',
  ceny: 'Ceny',
  uzbrojenie: 'Uzbrojenie',
};

/**
 * One WMS layer inside a service, with a title written for non-specialists.
 * Scale limits, queryability and legends come from the capabilities cache (see meta.ts).
 */
export interface SubLayer {
  name: string;
  title: string;
  /** Selected when the service is switched on. */
  default?: boolean;
}

interface ServiceBase {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  attribution: string;
  /** Same content on geoportal.gov.pl, for the "blocked" fallback. */
  geoportalUrl: string;
}

/** A WMTS service on the shared GUGiK EPSG:2180 grid: a building block of base maps. */
export interface TileService {
  id: string;
  kind: 'wmts';
  url: string;
  layer: string;
  format: string;
  /** First level of the shared GUGiK series and number of levels published. */
  firstLevel: number;
  levels: number;
}

/** A tile service inside a base map, drawn only in its scale range. */
export interface BaseSource {
  service: string;
  /** Drawn at scales from 1:minScale (zoomed out at least that far). */
  minScale?: number;
  /** Drawn at scales up to 1:maxScale (zoomed in at least that far). */
  maxScale?: number;
}

/**
 * Base map as the user sees it: one map, composed of tile services that switch with scale,
 * the way geoportal.gov.pl composes its base maps. Some services have content only in part
 * of the scale range (BDOT10k from 1:47 247, BDOO up to 1:94 494), so they are combined.
 */
export interface BaseMap {
  id: string;
  title: string;
  description: string;
  sources: BaseSource[];
  /** Preview tile: service, level of the shared series and point (EPSG:2180), central Warsaw by default. */
  thumbnail?: { service: string; level: number; at?: [number, number] };
  /** Requires a token on geoportal.gov.pl: listed, but disabled with a link. */
  restricted?: boolean;
}

/** Overlay: dynamic WMS rendered as one image per view. */
export interface Overlay extends ServiceBase {
  kind: 'wms';
  topic: Topic;
  /** Shown in the "Na start" group of the catalog. */
  starter?: boolean;
  url: string;
  /** Listed in drawing order, bottom to top. */
  sublayers: SubLayer[];
  opacity?: number;
}

export type ServiceDef = TileService | Overlay;

export const GUGIK_ATTRIBUTION = 'Dane: <a href="https://www.geoportal.gov.pl" target="_blank" rel="noopener">GUGiK, geoportal.gov.pl</a>';
const WMTS_GUEST = 'https://mapy.geoportal.gov.pl/wss/service/WMTS/guest/wmts/';
const PZGIK = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/';
const INTEGRACJA = 'https://integracja.gugik.gov.pl/cgi-bin/';
const EXT = 'https://mapy.geoportal.gov.pl/wss/ext/';
export const GEOPORTAL_MAP = 'https://mapy.geoportal.gov.pl/imap/Imgp_2.html';

const common = { attribution: GUGIK_ATTRIBUTION, geoportalUrl: GEOPORTAL_MAP };

export const TILE_SERVICES: TileService[] = [
  { id: 'orto', kind: 'wmts', url: `${PZGIK}ORTO/WMTS/StandardResolution`, layer: 'ORTOFOTOMAPA', format: 'image/jpeg', firstLevel: 0, levels: 17 },
  { id: 'bdoo', kind: 'wmts', url: `${PZGIK}BDOO/WMTS/aktualne`, layer: 'BDOO', format: 'image/png', firstLevel: 2, levels: 13 },
  { id: 'bdot10k', kind: 'wmts', url: `${WMTS_GUEST}BDOT10k`, layer: 'BDOT10k', format: 'image/png', firstLevel: 2, levels: 13 },
  { id: 'relief', kind: 'wmts', url: `${PZGIK}NMT/GRID1/WMTS/HypsometryAndShadedRelief`, layer: 'HipsoCien', format: 'image/jpeg', firstLevel: 2, levels: 13 },
  { id: 'g2mobile', kind: 'wmts', url: `${WMTS_GUEST}G2_MOBILE_500`, layer: 'G2_MOBILE_500', format: 'image/png', firstLevel: 0, levels: 16 },
  { id: 'topo', kind: 'wmts', url: `${WMTS_GUEST}TOPO`, layer: 'MAPA TOPOGRAFICZNA', format: 'image/jpeg', firstLevel: 2, levels: 13 },
];

export const TILE_SERVICE_BY_ID: ReadonlyMap<string, TileService> = new Map(TILE_SERVICES.map((s) => [s.id, s]));

/** Switch between BDOO and BDOT10k, inside the gap where neither has much detail. */
const MAP_SWITCH_SCALE = 70000;

export const BASE_MAPS: BaseMap[] = [
  {
    id: 'orto',
    title: 'Zdjęcia',
    description: 'Ortofotomapa',
    sources: [{ service: 'orto' }],
    thumbnail: { service: 'orto', level: 10 },
  },
  {
    id: 'mapa',
    title: 'Mapa',
    description: 'Mapa ogólnogeograficzna BDOO, po przybliżeniu topograficzna BDOT10k',
    sources: [
      { service: 'bdoo', minScale: MAP_SWITCH_SCALE },
      { service: 'bdot10k', maxScale: MAP_SWITCH_SCALE },
    ],
    thumbnail: { service: 'bdot10k', level: 10 },
  },
  {
    id: 'teren',
    title: 'Teren',
    description: 'Rzeźba terenu: wysokości i cieniowanie z NMT',
    sources: [{ service: 'relief' }],
    // The Tatra mountains show relief better than flat Warsaw.
    thumbnail: { service: 'relief', level: 6, at: [570000, 160000] },
  },
  {
    id: 'prosta',
    title: 'Prosta',
    description: 'Uproszczona mapa, szybka na telefonie',
    sources: [{ service: 'g2mobile' }],
    thumbnail: { service: 'g2mobile', level: 10 },
  },
  {
    id: 'skany',
    title: 'Skany',
    description: 'Skany map topograficznych',
    sources: [{ service: 'topo' }],
    thumbnail: { service: 'topo', level: 10 },
  },
  {
    id: 'brak',
    title: 'Brak',
    description: 'Bez podkładu mapowego',
    sources: [],
  },
];

/** Listed in drawing order, bottom to top. */
export const OVERLAYS: Overlay[] = [
  {
    ...common,
    id: 'kieg',
    kind: 'wms',
    title: 'Ewidencja gruntów i budynków',
    description: 'Działki, numery działek, budynki, obręby, użytki.',
    topic: 'dzialki',
    keywords: ['działki', 'ewidencja', 'egib', 'granice', 'numery', 'budynki', 'obręby', 'użytki', 'kontury', 'klasy'],
    starter: true,
    url: `${INTEGRACJA}KrajowaIntegracjaEwidencjiGruntow`,
    sublayers: [
      { name: 'uzytki', title: 'Użytki gruntowe' },
      { name: 'kontury', title: 'Kontury klasyfikacyjne' },
      { name: 'obreby', title: 'Granice obrębów', default: true },
      { name: 'dzialki', title: 'Działki', default: true },
      { name: 'geoportal', title: 'Działki uzupełnione z LPIS' },
      { name: 'budynki', title: 'Budynki', default: true },
      { name: 'numery_dzialek', title: 'Numery działek', default: true },
    ],
  },
  {
    ...common,
    id: 'kimpzp',
    kind: 'wms',
    title: 'Plany miejscowe (MPZP)',
    description: 'Miejscowe plany zagospodarowania przestrzennego.',
    topic: 'planowanie',
    keywords: ['mpzp', 'plan', 'zagospodarowanie', 'przeznaczenie', 'budowa', 'zabudowa'],
    starter: true,
    url: `${EXT}KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego`,
    opacity: 0.8,
    // `granice` and `plany` are left out: they redirect (302) to municipal servers that reject browser requests.
    sublayers: [
      { name: 'raster', title: 'Plany rastrowe (skany rysunków)', default: true },
      { name: 'wektor-str', title: 'Strefy przeznaczenia', default: true },
      { name: 'wektor-pow', title: 'Obiekty powierzchniowe', default: true },
      { name: 'wektor-lin', title: 'Obiekty liniowe', default: true },
      { name: 'wektor-lzb', title: 'Linie zabudowy', default: true },
      { name: 'wektor-pkt', title: 'Obiekty punktowe', default: true },
    ],
  },
  {
    ...common,
    id: 'pog',
    kind: 'wms',
    title: 'Plany ogólne gmin (POG)',
    description: 'Strefy planistyczne z uchwalonych planów ogólnych.',
    topic: 'planowanie',
    keywords: ['pog', 'plan ogólny', 'strefy', 'planistyczne'],
    url: `${EXT}PlanyOgolneGmin`,
    opacity: 0.8,
    sublayers: [
      { name: 'aktPlanowaniaprzestrzennego', title: 'Zasięg planu ogólnego', default: true },
      { name: 'strefaPlanistyczna', title: 'Strefy planistyczne', default: true },
      { name: 'obszarUzupelnieniaZabudowy', title: 'Obszary uzupełnienia zabudowy', default: true },
      { name: 'obszarZabSrodmiejskiej', title: 'Obszary zabudowy śródmiejskiej', default: true },
    ],
  },
  {
    ...common,
    id: 'rcn',
    kind: 'wms',
    title: 'Ceny transakcyjne (RCN)',
    description: 'Rejestr cen nieruchomości, tylko powiaty publikujące dane.',
    topic: 'ceny',
    keywords: ['ceny', 'rcn', 'transakcje', 'wartość', 'sprzedaż', 'mieszkania', 'lokale'],
    starter: true,
    url: 'https://mapy.geoportal.gov.pl/wss/service/rcn',
    sublayers: [
      { name: 'powiaty', title: 'Powiaty z danymi', default: true },
      { name: 'dzialki', title: 'Transakcje: działki', default: true },
      { name: 'budynki', title: 'Transakcje: budynki', default: true },
      { name: 'lokale', title: 'Transakcje: lokale', default: true },
    ],
  },
  {
    ...common,
    id: 'kiut',
    kind: 'wms',
    title: 'Uzbrojenie terenu',
    description: 'Sieci: woda, kanalizacja, gaz, prąd, telekomunikacja, ciepło.',
    topic: 'uzbrojenie',
    keywords: ['uzbrojenie', 'gesut', 'sieci', 'przyłącze', 'media'],
    starter: true,
    url: `${INTEGRACJA}KrajowaIntegracjaUzbrojeniaTerenu`,
    sublayers: [
      { name: 'gesut', title: 'Powiaty z danymi', default: true },
      { name: 'przewod_wodociagowy', title: 'Woda', default: true },
      { name: 'przewod_kanalizacyjny', title: 'Kanalizacja', default: true },
      { name: 'przewod_gazowy', title: 'Gaz', default: true },
      { name: 'przewod_elektroenergetyczny', title: 'Elektroenergetyka', default: true },
      { name: 'przewod_telekomunikacyjny', title: 'Telekomunikacja', default: true },
      { name: 'przewod_cieplowniczy', title: 'Ciepłownictwo', default: true },
      { name: 'przewod_specjalny', title: 'Sieć specjalna', default: true },
      { name: 'przewod_niezidentyfikowany', title: 'Sieci niezidentyfikowane', default: true },
      { name: 'przewod_urzadzenia', title: 'Urządzenia', default: true },
    ],
  },
];

export const SERVICES: ServiceDef[] = [...TILE_SERVICES, ...OVERLAYS];

export const OVERLAY_BY_ID: ReadonlyMap<string, Overlay> = new Map(OVERLAYS.map((s) => [s.id, s]));

export function defaultSublayers(def: Overlay): string[] {
  return def.sublayers.filter((l) => l.default).map((l) => l.name);
}

/** Selected sublayers in drawing order. */
export function selectedSublayers(def: Overlay, custom: Record<string, string[]>): string[] {
  const chosen = custom[def.id];
  if (!chosen) return defaultSublayers(def);
  return def.sublayers.filter((l) => chosen.includes(l.name)).map((l) => l.name);
}
