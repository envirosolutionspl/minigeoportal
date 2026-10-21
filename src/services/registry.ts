/**
 * Registry of GUGiK services used by the app. Each entry drives the map layer,
 * the layer catalog, attribution and the availability probe.
 * Adding a service means adding one entry here.
 */

export type Topic = 'podklad' | 'dzialki' | 'planowanie' | 'ceny' | 'uzbrojenie' | 'teren';

export const TOPICS: Record<Topic, string> = {
  podklad: 'Podkłady',
  dzialki: 'Działki i budynki',
  planowanie: 'Planowanie',
  ceny: 'Ceny',
  uzbrojenie: 'Uzbrojenie',
  teren: 'Teren',
};

interface ServiceBase {
  id: string;
  title: string;
  description: string;
  topic: Topic;
  keywords: string[];
  /** Base layers are mutually exclusive; overlays stack. */
  base: boolean;
  /** Shown in the "Na start" group of the catalog. */
  starter?: boolean;
  /** Service sends Access-Control-Allow-Origin; needed for canvas export. */
  cors: boolean;
  attribution: string;
  /** Same content on geoportal.gov.pl, for the "blocked" fallback. */
  geoportalUrl: string;
  minZoom?: number;
  opacity?: number;
}

export interface WmtsService extends ServiceBase {
  kind: 'wmts';
  url: string;
  layer: string;
  format: string;
  /** First level of the shared GUGiK series and number of levels published. */
  firstLevel: number;
  levels: number;
}

export interface WmsService extends ServiceBase {
  kind: 'wms';
  url: string;
  layers: string;
  format?: string;
}

export type ServiceDef = WmtsService | WmsService;

const GUGIK = 'Dane: <a href="https://www.geoportal.gov.pl" target="_blank" rel="noopener">GUGiK, geoportal.gov.pl</a>';
const WMTS_GUEST = 'https://mapy.geoportal.gov.pl/wss/service/WMTS/guest/wmts/';
const PZGIK = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/';
const INTEGRACJA = 'https://integracja.gugik.gov.pl/cgi-bin/';
const EXT = 'https://mapy.geoportal.gov.pl/wss/ext/';
const GEOPORTAL_MAP = 'https://mapy.geoportal.gov.pl/imap/Imgp_2.html';

export const SERVICES: ServiceDef[] = [
  {
    id: 'orto',
    kind: 'wmts',
    title: 'Ortofotomapa',
    description: 'Aktualne zdjęcia lotnicze całej Polski.',
    topic: 'podklad',
    keywords: ['zdjęcia', 'satelita', 'lotnicze', 'orto'],
    base: true,
    starter: true,
    cors: true,
    url: `${PZGIK}ORTO/WMTS/StandardResolution`,
    layer: 'ORTOFOTOMAPA',
    format: 'image/jpeg',
    firstLevel: 0,
    levels: 17,
    attribution: GUGIK,
    geoportalUrl: GEOPORTAL_MAP,
  },
  {
    id: 'bdot10k',
    kind: 'wmts',
    title: 'Mapa',
    description: 'Mapa topograficzna BDOT10k: drogi, budynki, lasy, wody.',
    topic: 'podklad',
    keywords: ['mapa', 'bdot', 'topograficzna', 'drogi'],
    base: true,
    starter: true,
    cors: true,
    url: `${WMTS_GUEST}BDOT10k`,
    layer: 'BDOT10k',
    format: 'image/png',
    firstLevel: 2,
    levels: 13,
    attribution: GUGIK,
    geoportalUrl: GEOPORTAL_MAP,
  },
  {
    id: 'topo',
    kind: 'wmts',
    title: 'Mapa topograficzna (skany)',
    description: 'Skany map topograficznych z lat 90. i 2000.',
    topic: 'podklad',
    keywords: ['topo', 'skan', 'papierowa'],
    base: true,
    cors: true,
    url: `${WMTS_GUEST}TOPO`,
    layer: 'MAPA TOPOGRAFICZNA',
    format: 'image/jpeg',
    firstLevel: 2,
    levels: 13,
    attribution: GUGIK,
    geoportalUrl: GEOPORTAL_MAP,
  },
  {
    id: 'g2mobile',
    kind: 'wmts',
    title: 'Mapa uproszczona',
    description: 'Lekki podkład kartograficzny, szybki na telefonie.',
    topic: 'podklad',
    keywords: ['mobile', 'lekka', 'prosta'],
    base: true,
    cors: true,
    url: `${WMTS_GUEST}G2_MOBILE_500`,
    layer: 'G2_MOBILE_500',
    format: 'image/png',
    firstLevel: 0,
    levels: 16,
    attribution: GUGIK,
    geoportalUrl: GEOPORTAL_MAP,
  },
  {
    id: 'kieg-dzialki',
    kind: 'wms',
    title: 'Działki',
    description: 'Granice i numery działek ewidencyjnych.',
    topic: 'dzialki',
    keywords: ['działki', 'ewidencja', 'egib', 'granice', 'numery'],
    base: false,
    starter: true,
    cors: true,
    url: `${INTEGRACJA}KrajowaIntegracjaEwidencjiGruntow`,
    layers: 'dzialki,numery_dzialek',
    minZoom: 9,
    attribution: GUGIK,
    geoportalUrl: GEOPORTAL_MAP,
  },
  {
    id: 'kieg-budynki',
    kind: 'wms',
    title: 'Budynki',
    description: 'Obrysy budynków z ewidencji gruntów i budynków.',
    topic: 'dzialki',
    keywords: ['budynki', 'ewidencja', 'egib'],
    base: false,
    cors: true,
    url: `${INTEGRACJA}KrajowaIntegracjaEwidencjiGruntow`,
    layers: 'budynki',
    minZoom: 10,
    attribution: GUGIK,
    geoportalUrl: GEOPORTAL_MAP,
  },
  {
    id: 'kieg-uzytki',
    kind: 'wms',
    title: 'Użytki i klasy gruntów',
    description: 'Użytki gruntowe i kontury klasyfikacyjne.',
    topic: 'dzialki',
    keywords: ['użytki', 'kontury', 'klasy', 'rola', 'las', 'klasyfikacja'],
    base: false,
    cors: true,
    url: `${INTEGRACJA}KrajowaIntegracjaEwidencjiGruntow`,
    layers: 'uzytki,kontury',
    minZoom: 10,
    attribution: GUGIK,
    geoportalUrl: GEOPORTAL_MAP,
  },
  {
    id: 'kimpzp',
    kind: 'wms',
    title: 'Plany miejscowe (MPZP)',
    description: 'Miejscowe plany zagospodarowania przestrzennego.',
    topic: 'planowanie',
    keywords: ['mpzp', 'plan', 'zagospodarowanie', 'przeznaczenie', 'budowa'],
    base: false,
    starter: true,
    cors: true,
    url: `${EXT}KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego`,
    // Without `granice`/`plany`: those redirect (302) to municipal servers that reject browser requests.
    layers: 'raster,wektor-str,wektor-lzb,wektor-pow,wektor-lin,wektor-pkt',
    minZoom: 11,
    opacity: 0.8,
    attribution: GUGIK,
    geoportalUrl: GEOPORTAL_MAP,
  },
  {
    id: 'pog',
    kind: 'wms',
    title: 'Plany ogólne gmin (POG)',
    description: 'Strefy planistyczne z uchwalonych planów ogólnych.',
    topic: 'planowanie',
    keywords: ['pog', 'plan ogólny', 'strefy', 'planistyczne'],
    base: false,
    cors: true,
    url: `${EXT}PlanyOgolneGmin`,
    layers: 'strefaPlanistyczna,obszarZabSrodmiejskiej,obszarUzupelnieniaZabudowy',
    minZoom: 8,
    opacity: 0.8,
    attribution: GUGIK,
    geoportalUrl: GEOPORTAL_MAP,
  },
  {
    id: 'rcn',
    kind: 'wms',
    title: 'Ceny transakcyjne (RCN)',
    description: 'Transakcje z rejestru cen nieruchomości, tylko powiaty publikujące dane.',
    topic: 'ceny',
    keywords: ['ceny', 'rcn', 'transakcje', 'wartość', 'sprzedaż'],
    base: false,
    starter: true,
    cors: true,
    url: 'https://mapy.geoportal.gov.pl/wss/service/rcn',
    layers: 'powiaty,dzialki,budynki,lokale',
    minZoom: 6,
    attribution: GUGIK,
    geoportalUrl: GEOPORTAL_MAP,
  },
  {
    id: 'kiut',
    kind: 'wms',
    title: 'Uzbrojenie terenu',
    description: 'Sieci: woda, kanalizacja, gaz, prąd, telekomunikacja, ciepło.',
    topic: 'uzbrojenie',
    keywords: ['uzbrojenie', 'gesut', 'woda', 'gaz', 'kanalizacja', 'prąd', 'sieci', 'przyłącze'],
    base: false,
    starter: true,
    cors: true,
    url: `${INTEGRACJA}KrajowaIntegracjaUzbrojeniaTerenu`,
    // `gesut`/`kgesut` are county index layers; data layers are visible below 1:2000.
    layers:
      'kgesut_dane,przewod_wodociagowy,przewod_kanalizacyjny,przewod_gazowy,przewod_elektroenergetyczny,przewod_telekomunikacyjny,przewod_cieplowniczy,przewod_specjalny,przewod_niezidentyfikowany,przewod_urzadzenia',
    minZoom: 14,
    attribution: GUGIK,
    geoportalUrl: GEOPORTAL_MAP,
  },
];

export const SERVICE_BY_ID: ReadonlyMap<string, ServiceDef> = new Map(SERVICES.map((s) => [s.id, s]));

export const BASE_SERVICES = SERVICES.filter((s) => s.base);
export const OVERLAY_SERVICES = SERVICES.filter((s) => !s.base);
