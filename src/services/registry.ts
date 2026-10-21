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

/** One WMS layer inside a service. Scale limits come from the service capabilities. */
export interface SubLayer {
  name: string;
  title: string;
  /** Selected when the service is switched on. */
  default?: boolean;
  /** Visible at scales up to 1:maxScale (zoomed in further than that). */
  maxScale?: number;
  /** Visible at scales from 1:minScale (zoomed out further than that). */
  minScale?: number;
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

/** Base map: cached WMTS tiles on the shared GUGiK EPSG:2180 grid. */
export interface BaseMap extends ServiceBase {
  kind: 'wmts';
  url: string;
  layer: string;
  format: string;
  /** First level of the shared GUGiK series and number of levels published. */
  firstLevel: number;
  levels: number;
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

export type ServiceDef = BaseMap | Overlay;

const GUGIK = 'Dane: <a href="https://www.geoportal.gov.pl" target="_blank" rel="noopener">GUGiK, geoportal.gov.pl</a>';
const WMTS_GUEST = 'https://mapy.geoportal.gov.pl/wss/service/WMTS/guest/wmts/';
const PZGIK = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/';
const INTEGRACJA = 'https://integracja.gugik.gov.pl/cgi-bin/';
const EXT = 'https://mapy.geoportal.gov.pl/wss/ext/';
const GEOPORTAL_MAP = 'https://mapy.geoportal.gov.pl/imap/Imgp_2.html';

const common = { attribution: GUGIK, geoportalUrl: GEOPORTAL_MAP };

export const BASE_MAPS: BaseMap[] = [
  {
    ...common,
    id: 'orto',
    kind: 'wmts',
    title: 'Zdjęcia',
    description: 'Aktualna ortofotomapa',
    keywords: ['orto', 'zdjęcia', 'satelita'],
    url: `${PZGIK}ORTO/WMTS/StandardResolution`,
    layer: 'ORTOFOTOMAPA',
    format: 'image/jpeg',
    firstLevel: 0,
    levels: 17,
  },
  {
    ...common,
    id: 'bdot10k',
    kind: 'wmts',
    title: 'Mapa',
    description: 'Mapa topograficzna BDOT10k',
    keywords: ['mapa', 'bdot'],
    url: `${WMTS_GUEST}BDOT10k`,
    layer: 'BDOT10k',
    format: 'image/png',
    firstLevel: 2,
    levels: 13,
  },
  {
    ...common,
    id: 'g2mobile',
    kind: 'wmts',
    title: 'Prosta',
    description: 'Lekki podkład kartograficzny',
    keywords: ['mobile', 'prosta'],
    url: `${WMTS_GUEST}G2_MOBILE_500`,
    layer: 'G2_MOBILE_500',
    format: 'image/png',
    firstLevel: 0,
    levels: 16,
  },
  {
    ...common,
    id: 'topo',
    kind: 'wmts',
    title: 'Skany',
    description: 'Skany map topograficznych',
    keywords: ['topo', 'skan'],
    url: `${WMTS_GUEST}TOPO`,
    layer: 'MAPA TOPOGRAFICZNA',
    format: 'image/jpeg',
    firstLevel: 2,
    levels: 13,
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
      { name: 'uzytki', title: 'Użytki gruntowe', maxScale: 10000 },
      { name: 'kontury', title: 'Kontury klasyfikacyjne', maxScale: 10000 },
      { name: 'obreby', title: 'Granice obrębów', default: true, maxScale: 25000, minScale: 10000 },
      { name: 'dzialki', title: 'Działki', default: true, maxScale: 10000 },
      { name: 'geoportal', title: 'Działki uzupełnione z LPIS', maxScale: 2500 },
      { name: 'budynki', title: 'Budynki', default: true, maxScale: 2500 },
      { name: 'numery_dzialek', title: 'Numery działek', default: true, maxScale: 1500 },
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
      { name: 'raster', title: 'Plany rastrowe (skany rysunków)', default: true, maxScale: 10000 },
      { name: 'wektor-str', title: 'Strefy przeznaczenia', default: true, maxScale: 10000 },
      { name: 'wektor-pow', title: 'Obiekty powierzchniowe', default: true, maxScale: 5000 },
      { name: 'wektor-lin', title: 'Obiekty liniowe', default: true, maxScale: 5000 },
      { name: 'wektor-lzb', title: 'Linie zabudowy', default: true, maxScale: 5000 },
      { name: 'wektor-pkt', title: 'Obiekty punktowe', default: true, maxScale: 5000 },
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
      { name: 'aktPlanowaniaprzestrzennego', title: 'Zasięg planu ogólnego', default: true, maxScale: 8000000 },
      { name: 'strefaPlanistyczna', title: 'Strefy planistyczne', default: true, maxScale: 100001 },
      { name: 'obszarUzupelnieniaZabudowy', title: 'Obszary uzupełnienia zabudowy', default: true, maxScale: 100001 },
      { name: 'obszarZabSrodmiejskiej', title: 'Obszary zabudowy śródmiejskiej', default: true, maxScale: 100001 },
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
      { name: 'powiaty', title: 'Powiaty z danymi', default: true, minScale: 5001 },
      { name: 'dzialki', title: 'Transakcje: działki', default: true, maxScale: 5001 },
      { name: 'budynki', title: 'Transakcje: budynki', default: true, maxScale: 2000 },
      { name: 'lokale', title: 'Transakcje: lokale', default: true, maxScale: 2000 },
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
      { name: 'gesut', title: 'Powiaty z danymi', default: true, minScale: 50000 },
      { name: 'przewod_wodociagowy', title: 'Woda', default: true, maxScale: 1000 },
      { name: 'przewod_kanalizacyjny', title: 'Kanalizacja', default: true, maxScale: 1000 },
      { name: 'przewod_gazowy', title: 'Gaz', default: true, maxScale: 1000 },
      { name: 'przewod_elektroenergetyczny', title: 'Elektroenergetyka', default: true, maxScale: 1000 },
      { name: 'przewod_telekomunikacyjny', title: 'Telekomunikacja', default: true, maxScale: 1000 },
      { name: 'przewod_cieplowniczy', title: 'Ciepłownictwo', default: true, maxScale: 1000 },
      { name: 'przewod_specjalny', title: 'Sieć specjalna', default: true, maxScale: 1000 },
      { name: 'przewod_niezidentyfikowany', title: 'Sieci niezidentyfikowane', default: true, maxScale: 1000 },
      { name: 'przewod_urzadzenia', title: 'Urządzenia', default: true, maxScale: 1000 },
    ],
  },
];

export const SERVICES: ServiceDef[] = [...BASE_MAPS, ...OVERLAYS];

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

export function isVisibleAtScale(l: SubLayer, scale: number): boolean {
  return scale >= (l.minScale ?? 0) && scale <= (l.maxScale ?? Infinity);
}
