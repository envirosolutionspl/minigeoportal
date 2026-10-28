import { describe, expect, it } from 'vitest';
import { OGC_PIXEL } from '@/map/projection';
import { overlayById, type Overlay } from '@/config/runtime';
import { fetchFeatureInfo, nearestQueryable, parseFeatureInfo, queryLayers } from './featureinfo';
import { createOverlayLayer } from './layers';
import { registerMeta } from './meta';
import { stubFetch, withCapabilities } from '@/test/helpers';

/** Intergraph GeoMedia answer of the land register (KIEG), as returned 2026-10-21. */
const KIEG_XML = `<?xml version="1.0"?>
<FeatureCollection xmlns="http://www.intergraph.com/geomedia/gml" xmlns:gml="http://www.opengis.net/gml"><gml:featureMember><Layer Name="integracja"><Attribute Name="Identyfikator działki">141708_2.0021.22/1</Attribute><Attribute Name="Numer działki">22/1</Attribute><Attribute Name="Pole pow. w ewidencji gruntów (ha)">0.2200</Attribute><Attribute Name="Oznaczenie użytku"></Attribute><Attribute Name="Informacje dodatkowe o działce"><![CDATA[<a href="https://uldk.gugik.gov.pl/dzinfo.php?dzialka=141708_2.0021.22/1&print" target="_blank">Pobierz raport</a>]]></Attribute><Attribute Name="Kod QR"><![CDATA[<img src="https://x/qr"/>]]></Attribute></Layer></gml:featureMember></FeatureCollection>`;

/** ArcGIS HTML table of the local plans (KIMPZP): a column table, several rows, repeated scale variants. */
const row = (ozn: string, opis: string) =>
  `<tr><td>10536</td><td>XCIX/2582/18</td><td>11.04.2018</td><td>${ozn}</td><td>${opis}</td><td>http://www.bip.krakow.pl/?dok_id=97161</td><td>Polygon</td></tr>`;
const KIMPZP_HTML = `<html><body><h5>FeatureInfoCollection - layer name: 'Przeznaczenia MPZP skala od 1:2000'</h5>
<table><tr><th>id_pg</th><th>Uchwalenie</th><th>Data uchwalenia</th><th>Oznaczenie</th><th>opis_oznac</th><th>WWW</th><th>Shape</th></tr>${row('U.7', 'Tereny zabudowy usługowej')}${row('MW.1', 'Tereny mieszkaniowe')}</table>
<h5>FeatureInfoCollection - layer name: 'Przeznaczenia MPZP skala od 1:1000'</h5>
<table><tr><th>id_pg</th><th>Uchwalenie</th><th>Data uchwalenia</th><th>Oznaczenie</th><th>opis_oznac</th><th>WWW</th><th>Shape</th></tr>${row('U.7', 'Tereny zabudowy usługowej')}</table></body></html>`;

/** Key/value table as some county servers return. */
const KV_HTML = `<table><tr><th>Numer</th><td>12/3</td></tr><tr><th>Powierzchnia</th><td>0.12 ha</td></tr><tr><td>tylko jedna komórka</td></tr></table>`;

describe('parseFeatureInfo', () => {
  it('reads Intergraph XML attributes, keeps links from CDATA and hides technical fields', () => {
    const [record] = parseFeatureInfo(KIEG_XML, 'text/xml');
    expect(record.fields).toEqual([
      { label: 'Identyfikator działki', value: '141708_2.0021.22/1' },
      { label: 'Numer działki', value: '22/1' },
      { label: 'Pole pow. w ewidencji gruntów (ha)', value: '0.2200' },
      {
        label: 'Informacje dodatkowe o działce',
        value: 'Pobierz raport',
        href: 'https://uldk.gugik.gov.pl/dzinfo.php?dzialka=141708_2.0021.22/1&print',
      },
    ]);
  });

  it('reads ArcGIS column tables with readable labels, titles and no duplicates', () => {
    const records = parseFeatureInfo(KIMPZP_HTML, 'text/html');
    expect(records).toHaveLength(2);
    expect(records[0].title).toBe('Przeznaczenia MPZP skala od 1:2000');
    expect(records[0].fields).toEqual([
      { label: 'Uchwalenie', value: 'XCIX/2582/18' },
      { label: 'Data uchwalenia', value: '11.04.2018' },
      { label: 'Oznaczenie', value: 'U.7' },
      { label: 'Przeznaczenie', value: 'Tereny zabudowy usługowej' },
      { label: 'Strona uchwały', value: 'http://www.bip.krakow.pl/?dok_id=97161', href: 'http://www.bip.krakow.pl/?dok_id=97161' },
    ]);
    expect(records[1].fields[2]).toEqual({ label: 'Oznaczenie', value: 'MW.1' });
  });

  it('reads key/value tables and skips rows without a value', () => {
    expect(parseFeatureInfo(KV_HTML, 'text/html')).toEqual([
      {
        title: undefined,
        fields: [
          { label: 'Numer', value: '12/3' },
          { label: 'Powierzchnia', value: '0.12 ha' },
        ],
      },
    ]);
  });

  it('reads generic GML by grouping text leaves under their feature', () => {
    const gml = `<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml" xmlns:ms="http://mapserver.gis.umn.edu/mapserver"><gml:featureMember><ms:dzialki_feature><ms:TRAN_CENA_BRUTTO>250000</ms:TRAN_CENA_BRUTTO><ms:DOK_DATA>2021-05-20</ms:DOK_DATA><gml:boundedBy><gml:Box>1 2 3 4</gml:Box></gml:boundedBy></ms:dzialki_feature></gml:featureMember></wfs:FeatureCollection>`;
    expect(parseFeatureInfo(gml, 'application/vnd.ogc.gml')).toEqual([
      {
        title: 'dzialki',
        fields: [
          { label: 'TRAN CENA BRUTTO', value: '250000' },
          { label: 'DOK DATA', value: '2021-05-20' },
        ],
      },
    ]);
  });

  it('treats empty bodies, unpublished layers and pages without labelled values as "no data"', () => {
    expect(parseFeatureInfo('', 'text/html')).toEqual([]);
    expect(
      parseFeatureInfo(
        '<ServiceExceptionReport><ServiceException code="LayerNotDefined">msWMS: Invalid layer(s)</ServiceException></ServiceExceptionReport>',
        'text/xml',
      ),
    ).toEqual([]);
    expect(parseFeatureInfo('<html><body><h1>Dane o planach</h1><p>wybierz warstwę</p></body></html>', 'text/html')).toEqual([]);
    expect(parseFeatureInfo('<GETFEATUREINFO>\n\n</GETFEATUREINFO>', 'text/xml')).toEqual([]);
  });

  it('reports a real service exception as an error', () => {
    expect(() =>
      parseFeatureInfo('<ServiceExceptionReport><ServiceException>Internal error</ServiceException></ServiceExceptionReport>', 'text/xml'),
    ).toThrow();
  });

  it('never carries markup into values', () => {
    const [record] = parseFeatureInfo(
      '<table><tr><th>Opis</th><td><b>bold</b> <script>alert(1)</script>text</td></tr></table>',
      'text/html',
    );
    expect(record.fields[0].value).toBe('bold text');
  });
});

/** Navigation warnings (BHMW), as returned 2026-10-28: GUGiK's page template of lists in folded sections. */
const BHMW_HTML = `<html><head><style>li { padding: 7px 0 }</style></head><body><h1>Dane o ostrzeżeniach nawigacyjnych</h1><hr>
<h2>Dane dla wybranej lokalizacji</h2><div class="accordion"><button class="accordion-header"><p><span>Ostrzeżenie nawigacyjne</span><br><span>276/2026</span></p><span class="arrow-unicode">▼</span></button>
<div class="accordion-content"><h3>Informacje ogólne</h3><ul>
<li><span class="list-item-value">Numer ostrzeżenia nawigacyjnego</span> 276/2026 </li>
<li><span class="list-item-value">Rodzaj ostrzeżenia nawigacyjnego</span> NAVTEX </li>
<li><span class="list-item-value">Uwagi</span> STREFA Nr: 6 ZAMKNIĘTA </li>
<li><span class="list-item-value">Pobierz plik z treścią ostrzeżenia</span> <a href="https://www.bhmw.gov.pl/documents/7430/ON_PL276_2026.pdf" target="_blank">PDF</a></li>
</ul></div></div><hr><h2>Pozostałe informacje</h2><ul><li><span class="list-item-value">O usłudze</span> Usługa WMS udostępnia informacje o aktualnych ostrzeżeniach.</li></ul></body></html>`;

/** Electoral districts, as returned 2026-10-28: one-column tables of "label - value" and "label: value" lines. */
const DISTRICTS_HTML = `<body><table class="styled-table"><thead><tr><th>SEJM - Informacje dodatkowe o okregu wyborczym</th></tr></thead><tbody>
<tr><td>Numer okregu - 16</td></tr><tr><td>Siedziba Okręgowej Komisji Wyborczej: PŁOCK</td></tr><tr><td>Liczba posłów wybieranych w okręgu wyborczym wynosi : 10</td></tr></tbody></table></body>`;

/** Geographic names to download (PRNG), as returned 2026-10-28: a one-column table of links. */
const DOWNLOADS_HTML = `<table class="styled-table"><thead><tr><th>Nazwy geograficzne RP</th></tr></thead><tbody>
<tr><td><a ><a href="https://opendata.geoportal.gov.pl/prng/PRNG_MIEJSCOWOSCI_SHP.zip">Miejscowości SHP</a></td></tr>
<tr><td ><a href="https://opendata.geoportal.gov.pl/prng/PRNG_MIEJSCOWOSCI_GML.zip">Miejscowości GML</a></td></tr></tbody></table>`;

/** Sections of the map sheets in PUWG 1992, as returned 2026-10-28: bold labels, one sheet per page. */
const SHEETS_HTML = `<html><head><meta charset="utf-8" /></head><body><b>Godło sekcji:</b> N-34-139-A-a-3<br/> <b>Skala:</b> 1:10000<br/><br/></body></html><html><body><b>Godło sekcji:</b> N-34-139-A-a-3-3<br/> <b>Skala:</b> 1:5000<br/><br/></body></html>`;

/** Monitoring of the county services, as returned 2026-10-28: a bold label to a paragraph, a status written by a script. */
const MONITORING_HTML = `<body><div class="card"><h3>powiat nowodworski</h3><p><strong>TERYT:</strong> 1414</p>
<p><strong>Status usługi:</strong> <script>document.write(getStatusBadge(1));</script></p>
<p><strong>Odpowiedź</strong> 200 - OK, keyword is found</p><p><strong>Ostatnie sprawdzenie:</strong> 2026-10-28 12:48:30</p></div></body>`;

describe('parseFeatureInfo: pages other than tables', () => {
  it('reads lists of labelled values, titled by their folded section, and leaves out the part about the service', () => {
    expect(parseFeatureInfo(BHMW_HTML, 'text/html')).toEqual([
      {
        title: 'Ostrzeżenie nawigacyjne 276/2026 – Informacje ogólne',
        fields: [
          { label: 'Numer ostrzeżenia nawigacyjnego', value: '276/2026' },
          { label: 'Rodzaj ostrzeżenia nawigacyjnego', value: 'NAVTEX' },
          { label: 'Uwagi', value: 'STREFA Nr: 6 ZAMKNIĘTA' },
          { label: 'Pobierz plik z treścią ostrzeżenia', value: 'PDF', href: 'https://www.bhmw.gov.pl/documents/7430/ON_PL276_2026.pdf' },
        ],
      },
    ]);
    // A page with only the part about the service found nothing at the place.
    expect(parseFeatureInfo(BHMW_HTML.replace(/<h2>Dane dla[\s\S]*<\/div><\/div>/, ''), 'text/html')).toEqual([]);
  });

  it('splits the lines of a one-column table into labels and values under its heading', () => {
    expect(parseFeatureInfo(DISTRICTS_HTML, 'text/html')).toEqual([
      {
        title: 'SEJM - Informacje dodatkowe o okregu wyborczym',
        fields: [
          { label: 'Numer okregu', value: '16' },
          { label: 'Siedziba Okręgowej Komisji Wyborczej', value: 'PŁOCK' },
          { label: 'Liczba posłów wybieranych w okręgu wyborczym wynosi', value: '10' },
        ],
      },
    ]);
  });

  it('keeps a one-column table of files as links, and a lone ArcGIS attribute under its name', () => {
    expect(parseFeatureInfo(DOWNLOADS_HTML, 'text/html')).toEqual([
      {
        title: 'Nazwy geograficzne RP',
        fields: [
          { label: 'Miejscowości SHP', value: 'Otwórz', href: 'https://opendata.geoportal.gov.pl/prng/PRNG_MIEJSCOWOSCI_SHP.zip' },
          { label: 'Miejscowości GML', value: 'Otwórz', href: 'https://opendata.geoportal.gov.pl/prng/PRNG_MIEJSCOWOSCI_GML.zip' },
        ],
      },
    ]);
    const ndvi = `<h5>FeatureInfoCollection - layer name: 'Sentinel2020_NDVI'</h5><table border="1"><tbody><tr><th>Stretch.Pixel Value</th></tr><tr><td>0.397531</td></tr></tbody></table>`;
    expect(parseFeatureInfo(ndvi, 'text/html')).toEqual([
      { title: 'Sentinel2020_NDVI', fields: [{ label: 'Stretch.Pixel Value', value: '0.397531' }] },
    ]);
  });

  it('reads bold labels, one record per repeated set, gathered from paragraphs under their heading', () => {
    expect(parseFeatureInfo(SHEETS_HTML, 'text/html')).toEqual([
      {
        title: undefined,
        fields: [
          { label: 'Godło sekcji', value: 'N-34-139-A-a-3' },
          { label: 'Skala', value: '1:10000' },
        ],
      },
      {
        title: undefined,
        fields: [
          { label: 'Godło sekcji', value: 'N-34-139-A-a-3-3' },
          { label: 'Skala', value: '1:5000' },
        ],
      },
    ]);
    // The status a script would write is not there: that line is left out.
    expect(parseFeatureInfo(MONITORING_HTML, 'text/html')).toEqual([
      {
        title: 'powiat nowodworski',
        fields: [
          { label: 'TERYT', value: '1414' },
          { label: 'Odpowiedź', value: '200 - OK, keyword is found' },
          { label: 'Ostatnie sprawdzenie', value: '2026-10-28 12:48:30' },
        ],
      },
    ]);
  });

  it('reads pairs of field name and value elements (ArcGIS indexes)', () => {
    const index = `<div class="gwt-HTML item-content"><span class="item-fieldname">nazwa powiatu</span><span class="item-fieldvalue">płoński</span><span class="item-fieldname">rok ostatniej aktualizacji</span><span class="item-fieldvalue">2023</span></div>`;
    expect(parseFeatureInfo(index, 'text/html')[0].fields).toEqual([
      { label: 'nazwa powiatu', value: 'płoński' },
      { label: 'rok ostatniej aktualizacji', value: '2023' },
    ]);
  });
});

describe('queryLayers', () => {
  it('keeps only queryable sublayers visible at the scale, and everything without metadata', async () => {
    await withCapabilities();
    const kieg = overlayById.get('kieg')!;
    expect(queryLayers(kieg, ['obreby', 'dzialki', 'budynki', 'numery_dzialek'], 5000)).toEqual(['dzialki']);
    expect(queryLayers(kieg, ['obreby', 'dzialki'], 15000)).toEqual(['obreby']);
    expect(queryLayers(overlayById.get('pog')!, ['strefaPlanistyczna'], 5000)).toEqual(['strefaPlanistyczna']);
  });
});

describe('nearestQueryable', () => {
  it('names the queryable layer nearest in scale and a scale just inside its range', async () => {
    await withCapabilities();
    const kieg = overlayById.get('kieg')!;
    // Zoomed out: the precincts (up to 1:25 000) come before the parcels (1:10 000).
    expect(nearestQueryable(kieg, ['obreby', 'dzialki', 'budynki'], 47247)).toEqual({ title: 'Obręby', scale: 22500, limit: 25000 });
    // Zoomed in past the precincts, with the parcels off: the precincts answer from 1:10 000 out.
    expect(nearestQueryable(kieg, ['obreby'], 5000)).toEqual({ title: 'Obręby', scale: 11000, limit: 10000 });
    // A layer answers now, or none is queryable: nothing to suggest.
    expect(nearestQueryable(kieg, ['obreby', 'dzialki'], 5000)).toBeUndefined();
    expect(nearestQueryable(kieg, ['budynki'], 47247)).toBeUndefined();
  });
});

describe('fetchFeatureInfo', () => {
  it('asks the proxy with the layers it was given and the preferred format', async () => {
    await withCapabilities();
    const { calls } = stubFetch([
      ['/api/capabilities', {}],
      ['/api/featureinfo/kieg', KIEG_XML, { headers: { 'X-Upstream-Content-Type': 'text/xml' } }],
    ]);
    const kieg = overlayById.get('kieg')!;
    const records = await fetchFeatureInfo(
      kieg,
      createOverlayLayer(kieg),
      [656849, 482462],
      0.5,
      ['dzialki'],
      new AbortController().signal,
    );
    const url = new URL(calls.at(-1)!, 'http://localhost');
    expect(url.pathname).toBe('/api/featureinfo/kieg');
    expect(url.searchParams.get('QUERY_LAYERS')).toBe('dzialki');
    expect(url.searchParams.get('LAYERS')).toBe('dzialki');
    expect(url.searchParams.get('INFO_FORMAT')).toBe('text/xml');
    expect(url.searchParams.get('CRS')).toBe('EPSG:2180');
    expect(records[0].fields[0].value).toBe('141708_2.0021.22/1');
  });

  it('asks once more in HTML when the server fails on the structured format', async () => {
    await withCapabilities();
    const { calls } = stubFetch([
      [/INFO_FORMAT=text%2Fxml/, 'Upstream', { status: 502 }],
      [/INFO_FORMAT=text%2Fhtml/, KV_HTML, { headers: { 'X-Upstream-Content-Type': 'text/html' } }],
    ]);
    const kieg = overlayById.get('kieg')!;
    const records = await fetchFeatureInfo(kieg, createOverlayLayer(kieg), [1, 2], 1, ['dzialki'], new AbortController().signal);
    expect(calls).toHaveLength(2);
    expect(records[0].fields[0]).toMatchObject({ label: 'Numer', value: '12/3' });
  });

  it('turns a proxy error status into an exception', async () => {
    await withCapabilities();
    stubFetch([['/api/featureinfo/', 'busy', { status: 503 }]]);
    const kieg = overlayById.get('kieg')!;
    await expect(fetchFeatureInfo(kieg, createOverlayLayer(kieg), [1, 2], 1, ['dzialki'], new AbortController().signal)).rejects.toThrow(
      'HTTP 503',
    );
  });
});

describe('WMTS and ArcGIS layers', () => {
  const base = overlayById.get('kieg')!;
  const topo: Overlay = {
    ...base,
    id: 'msTopo',
    kind: 'wmts',
    url: 'https://gugik.example/wmts',
    sublayers: [{ name: 'MAPA', title: 'Mapa' }],
  };
  const gleby: Overlay = {
    ...base,
    id: 'msGleby',
    kind: 'rest',
    url: 'https://gugik.example/gleby/MapServer',
    sublayers: [
      { name: '2', title: 'Kontury' },
      { name: '1', title: 'Zasięg' },
    ],
  };
  const cache: Overlay = { ...gleby, id: 'msCache', sublayers: [{ name: 'tiles', title: 'Mapa' }] };
  const layers = {
    '0': { title: 'Odkrywki', queryable: true, maxScale: 50000 },
    '1': { title: 'Zasięg', queryable: true, minScale: 50001 },
    '2': { title: 'Kontury', queryable: true, maxScale: 50000 },
    '3': { title: 'Grupa', queryable: false, group: true },
  };
  // Resolution 100 m: one 512-pixel tile is 51 200 m wide.
  const matrixSet = {
    id: 'EPSG:2180',
    origin: [100000, 850000] as [number, number],
    tileSize: 512,
    matrices: [{ id: 'EPSG:2180:0', scale: 100 / OGC_PIXEL, width: 20, height: 20 }],
  };

  it('queries a WMTS only when it lists formats, and an ArcGIS tile cache in all its layers in scale', () => {
    registerMeta('msTopo', { kind: 'wmts', fetchedAt: 'x', title: 'T', layer: 'MAPA', matrixSet });
    expect(queryLayers(topo, ['MAPA'], 5000)).toEqual([]);
    registerMeta('msTopo', { kind: 'wmts', fetchedAt: 'x', title: 'T', layer: 'MAPA', infoFormats: ['text/html'], matrixSet });
    expect(queryLayers(topo, ['MAPA'], 5000)).toEqual(['MAPA']);

    registerMeta('msGleby', { kind: 'rest', fetchedAt: 'x', title: 'G', layers });
    expect(queryLayers(gleby, ['2', '1'], 5000)).toEqual(['2']);
    registerMeta('msCache', {
      kind: 'rest',
      fetchedAt: 'x',
      title: 'G',
      layers,
      tiles: { origin: [100000, 850000], tileSize: 512, resolutions: [100] },
    });
    expect(queryLayers(cache, ['tiles'], 5000)).toEqual(['0', '2']);
  });

  it('names the tile and pixel for a WMTS and a small window around the point for ArcGIS', async () => {
    registerMeta('msTopo', {
      kind: 'wmts',
      fetchedAt: 'x',
      title: 'T',
      layer: 'MAPA',
      infoFormats: ['text/xml; subtype=gml/3.2', 'text/html'],
      matrixSet,
    });
    const { calls } = stubFetch([['/api/featureinfo/', '<html></html>']]);
    const signal = new AbortController().signal;
    await fetchFeatureInfo(topo, createOverlayLayer(topo), [100000 + 51200 + 1050, 850000 - 51200 - 2050], 100, ['MAPA'], signal);
    const tile = new URL(calls.at(-1)!, 'http://localhost').searchParams;
    expect(Object.fromEntries(tile)).toEqual({
      TILEMATRIX: 'EPSG:2180:0',
      TILECOL: '1',
      TILEROW: '1',
      I: '10',
      J: '20',
      INFOFORMAT: 'text/html',
    });

    registerMeta('msGleby', { kind: 'rest', fetchedAt: 'x', title: 'G', layers });
    await fetchFeatureInfo(gleby, createOverlayLayer(gleby), [560000, 420000], 2, ['2'], signal);
    const point = new URL(calls.at(-1)!, 'http://localhost').searchParams;
    expect(Object.fromEntries(point)).toEqual({
      QUERY_LAYERS: '2',
      BBOX: '559900,419900,560100,420100',
      WIDTH: '100',
      HEIGHT: '100',
      I: '50',
      J: '50',
    });
  });

  it('reads ArcGIS identify results and WMTS tables without technical fields', () => {
    const identify = JSON.stringify({
      results: [
        {
          layerId: 2,
          layerName: 'KONTURY_GLEBOWE',
          attributes: { OBJECTID: '1', SYS_ID: '9', 'SHAPE.AREA': '1,5', Shape: 'Polygon', UWAGI: 'Null', TYPPODTYP: 'Bw', KOMPLEKS: '7' },
        },
      ],
    });
    expect(parseFeatureInfo(identify, 'application/json')).toEqual([
      {
        title: 'KONTURY_GLEBOWE',
        fields: [
          { label: 'TYPPODTYP', value: 'Bw' },
          { label: 'KOMPLEKS', value: '7' },
        ],
      },
    ]);
    expect(() => parseFeatureInfo('{"error":{"code":400}}', 'text/plain')).toThrow('The service rejected the query');
    const sheet = (category: string, name: string) =>
      `<h3>warstwa: <b>Arkusze</b></h3><table><tr><th>SHAPE</th><td>Polygon</td></tr><tr><th>LOWPS</th><td>0,8</td></tr><tr><th>CATEGORY</th><td>${category}</td></tr><tr><th>SERIA</th><td>TOPO_10_1992</td></tr><tr><th>NAME</th><td>${name}</td></tr></table>`;
    const wmts = `<html><body>${sheet('Primary', 'N-34-139-B-c-3')}${sheet('Overview', 'Ov_i281')}</body></html>`;
    expect(parseFeatureInfo(wmts, 'text/html')).toEqual([
      {
        title: 'Arkusze',
        fields: [
          { label: 'SERIA', value: 'TOPO_10_1992' },
          { label: 'NAME', value: 'N-34-139-B-c-3' },
        ],
      },
    ]);
  });
});
