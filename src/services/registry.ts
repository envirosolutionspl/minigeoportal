/**
 * Registry of GUGiK services used by the app. Each entry drives the map layers, the
 * layer catalog, the capabilities cache and the GetFeatureInfo proxy.
 * Adding a service means adding one entry here.
 */

export type Topic =
  | 'dzialki'
  | 'planowanie'
  | 'ceny'
  | 'uzbrojenie'
  | 'granice'
  | 'teren'
  | 'srodowisko'
  | 'zagrozenia'
  | 'zabytki'
  | 'archiwalne'
  | 'pobieranie'
  | 'geodezja'
  | 'inne';

/** Topics of the catalog; geoportal.gov.pl layers are sorted into them by the server (catalog.ts). */
export const TOPICS: Record<Topic, string> = {
  dzialki: 'Działki i budynki',
  planowanie: 'Planowanie',
  ceny: 'Ceny',
  uzbrojenie: 'Uzbrojenie i drogi',
  granice: 'Granice i adresy',
  teren: 'Teren i zdjęcia',
  srodowisko: 'Środowisko',
  zagrozenia: 'Zagrożenia',
  zabytki: 'Zabytki i turystyka',
  archiwalne: 'Archiwalne',
  pobieranie: 'Dane do pobrania',
  geodezja: 'Geodezja',
  inne: 'Inne',
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
  /** Static preview in public/thumbs, made from one tile of the service. */
  thumb?: string;
  /** Requires a token on geoportal.gov.pl: listed, but disabled with a link. */
  restricted?: boolean;
}

/** Overlay: dynamic WMS rendered as one image per view. */
export interface Overlay {
  id: string;
  /** Our own layers are WMS; the catalog adds WMTS and ArcGIS REST map services. */
  kind: 'wms' | 'wmts' | 'rest';
  title: string;
  description: string;
  topic: Topic;
  keywords: string[];
  /** Shown in the "Najpopularniejsze" group of the catalog. */
  starter?: boolean;
  url: string;
  /** Id of the same layer in the geoportal.gov.pl configuration, which gives the drawing order. */
  geoportalId: string;
  /** Listed in drawing order, bottom to top. */
  sublayers: SubLayer[];
  opacity?: number;
}

export type ServiceDef = TileService | Overlay;

export const GUGIK_ATTRIBUTION =
  'Dane: <a href="https://www.geoportal.gov.pl" target="_blank" rel="noopener">GUGiK, geoportal.gov.pl</a>';
/** The same content on geoportal.gov.pl, offered when a service is unavailable here. */
export const GEOPORTAL_MAP = 'https://mapy.geoportal.gov.pl/imap/Imgp_2.html';

/**
 * Parcel report of geoportal.gov.pl for the parcel at a point: land register data, plans,
 * terrain and more, with a PDF export. It takes PL-1992 X (northing) and Y (easting).
 */
export function parcelReportUrl([easting, northing]: [number, number]): string {
  const params = new URLSearchParams({ x: northing.toFixed(2), y: easting.toFixed(2) });
  return `https://mapy.geoportal.gov.pl/imap/parcelInfo/index3_a.html?${params}`;
}

const WMTS_GUEST = 'https://mapy.geoportal.gov.pl/wss/service/WMTS/guest/wmts/';
const PZGIK = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/';
const INTEGRACJA = 'https://integracja.gugik.gov.pl/cgi-bin/';
const EXT = 'https://mapy.geoportal.gov.pl/wss/ext/';

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
  { id: 'orto', title: 'Zdjęcia', description: 'Ortofotomapa', sources: [{ service: 'orto' }], thumb: '/thumbs/orto.jpg' },
  {
    id: 'mapa',
    title: 'Mapa',
    description: 'Mapa ogólnogeograficzna BDOO, po przybliżeniu topograficzna BDOT10k',
    sources: [
      { service: 'bdoo', minScale: MAP_SWITCH_SCALE },
      { service: 'bdot10k', maxScale: MAP_SWITCH_SCALE },
    ],
    thumb: '/thumbs/mapa.jpg',
  },
  {
    id: 'teren',
    title: 'Teren',
    description: 'Rzeźba terenu: wysokości i cieniowanie z NMT',
    sources: [{ service: 'relief' }],
    thumb: '/thumbs/teren.jpg',
  },
  {
    id: 'prosta',
    title: 'Prosta',
    description: 'Uproszczona mapa, szybka na telefonie',
    sources: [{ service: 'g2mobile' }],
    thumb: '/thumbs/prosta.jpg',
  },
  { id: 'skany', title: 'Skany', description: 'Skany map topograficznych', sources: [{ service: 'topo' }], thumb: '/thumbs/skany.jpg' },
  { id: 'brak', title: 'Brak', description: 'Bez podkładu mapowego', sources: [] },
];

/** Listed in drawing order, bottom to top. */
export const OVERLAYS: Overlay[] = [
  {
    id: 'kieg',
    geoportalId: 'msKIEG',
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
    id: 'kimpzp',
    geoportalId: 'msMPZP',
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
    id: 'pog',
    geoportalId: 'msPlanyOgolneGmin',
    kind: 'wms',
    title: 'Plany ogólne gmin (POG)',
    description: 'Strefy planistyczne z uchwalonych planów ogólnych.',
    topic: 'planowanie',
    keywords: ['pog', 'plan ogólny', 'strefy', 'planistyczne'],
    starter: true,
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
    id: 'rcn',
    geoportalId: 'msRejestrCenNieruchomosci',
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
    id: 'kiut',
    geoportalId: 'msKIUT',
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
  {
    id: 'kibdot',
    geoportalId: 'msKIBDOT',
    kind: 'wms',
    title: 'Obiekty topograficzne (BDOT500)',
    description: 'Szczegółowa mapa zasadnicza: budowle, ogrodzenia, chodniki, drogi, skarpy.',
    topic: 'dzialki',
    keywords: ['bdot500', 'mapa zasadnicza', 'topografia', 'ogrodzenia', 'budowle', 'chodniki', 'drogi', 'skarpy', 'kibdot'],
    starter: true,
    url: `${INTEGRACJA}KrajowaIntegracjaBazDanychObiektowTopograficznych`,
    sublayers: [
      { name: 'wdrozenia', title: 'Powiaty z danymi', default: true },
      { name: 'bdot', title: 'Obiekty topograficzne', default: true },
    ],
  },
  {
    id: 'suikzp',
    geoportalId: 'msSUiKZP',
    kind: 'wms',
    title: 'Studium zagospodarowania',
    description: 'Studium uwarunkowań i kierunków zagospodarowania gminy, gdzie nie ma planu.',
    topic: 'planowanie',
    keywords: ['studium', 'suikzp', 'kierunki', 'zagospodarowanie', 'gmina', 'przeznaczenie'],
    starter: true,
    url: `${EXT}KrajowaIntegracjaStudiumKierunkowZagospodarowaniaPrzestrzennego`,
    opacity: 0.8,
    sublayers: [
      { name: 'gminy', title: 'Gminy z danymi', default: true },
      { name: 'studium', title: 'Studium', default: true },
    ],
  },
  {
    id: 'kina',
    geoportalId: 'msAdresyUlice',
    kind: 'wms',
    title: 'Adresy i ulice',
    description: 'Punkty adresowe z numerami i osie ulic z gminnych ewidencji.',
    topic: 'granice',
    keywords: ['adresy', 'numery', 'ulice', 'emuia', 'punkty adresowe', 'kina'],
    starter: true,
    url: `${EXT}KrajowaIntegracjaNumeracjiAdresowej`,
    sublayers: [
      { name: 'A08_Ulice_Powierzchnie', title: 'Ulice: obszary' },
      { name: 'A08_Ulice_Linie', title: 'Ulice: osie', default: true },
      { name: 'A07_Punkty_adresowe', title: 'Punkty adresowe', default: true },
    ],
  },
  {
    id: 'prg',
    geoportalId: 'msPRG',
    kind: 'wms',
    title: 'Granice administracyjne (PRG)',
    description: 'Granice województw, powiatów, gmin i obrębów, a także sądów, urzędów i nadleśnictw.',
    topic: 'granice',
    keywords: ['granice', 'prg', 'gmina', 'powiat', 'województwo', 'obręb', 'jednostka', 'sąd', 'urząd skarbowy', 'nadleśnictwo', 'spis'],
    starter: true,
    url: `${PZGIK}PRG/WMS/AdministrativeBoundaries`,
    sublayers: [
      { name: 'R01_Granice_rejonow_statystycznych', title: 'Rejony statystyczne' },
      { name: 'U06_Nadlesnictwo', title: 'Nadleśnictwa' },
      { name: 'U02_Urzad_skarbowy', title: 'Urzędy skarbowe' },
      { name: 'S03_Sad_rejonowy', title: 'Sądy rejonowe' },
      { name: 'A06_Granice_obrebow_ewidencyjnych', title: 'Obręby ewidencyjne' },
      { name: 'A05_Granice_jednostek_ewidencyjnych', title: 'Jednostki ewidencyjne' },
      { name: 'A04_Granice_miast', title: 'Miasta' },
      { name: 'A03_Granice_gmin', title: 'Gminy', default: true },
      { name: 'A02_Granice_powiatow', title: 'Powiaty', default: true },
      { name: 'A01_Granice_wojewodztw', title: 'Województwa', default: true },
      { name: 'A00_Granice_panstwa', title: 'Granica państwa', default: true },
    ],
  },
];

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
