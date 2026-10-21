import { describe, expect, it } from 'vitest';
import ImageWMS from 'ol/source/ImageWMS';
import { EPSG2180 } from '@/map/projection';
import { OVERLAY_BY_ID } from './registry';
import { fetchFeatureInfo, parseFeatureInfo, queryLayers } from './featureinfo';
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
      { label: 'Informacje dodatkowe o działce', value: 'Pobierz raport', href: 'https://uldk.gugik.gov.pl/dzinfo.php?dzialka=141708_2.0021.22/1&print' },
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
      { title: undefined, fields: [{ label: 'Numer', value: '12/3' }, { label: 'Powierzchnia', value: '0.12 ha' }] },
    ]);
  });

  it('reads generic GML by grouping text leaves under their feature', () => {
    const gml = `<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml" xmlns:ms="http://mapserver.gis.umn.edu/mapserver"><gml:featureMember><ms:dzialki_feature><ms:TRAN_CENA_BRUTTO>250000</ms:TRAN_CENA_BRUTTO><ms:DOK_DATA>2021-05-20</ms:DOK_DATA><gml:boundedBy><gml:Box>1 2 3 4</gml:Box></gml:boundedBy></ms:dzialki_feature></gml:featureMember></wfs:FeatureCollection>`;
    expect(parseFeatureInfo(gml, 'application/vnd.ogc.gml')).toEqual([
      { title: 'dzialki', fields: [{ label: 'TRAN CENA BRUTTO', value: '250000' }, { label: 'DOK DATA', value: '2021-05-20' }] },
    ]);
  });

  it('treats empty bodies, unpublished layers and pages without tables as "no data"', () => {
    expect(parseFeatureInfo('', 'text/html')).toEqual([]);
    expect(parseFeatureInfo('<ServiceExceptionReport><ServiceException code="LayerNotDefined">msWMS: Invalid layer(s)</ServiceException></ServiceExceptionReport>', 'text/xml')).toEqual([]);
    expect(parseFeatureInfo('<html><body><h1>Dane o planach</h1><p>wybierz warstwę</p></body></html>', 'text/html')).toEqual([]);
    expect(parseFeatureInfo('<GETFEATUREINFO>\n\n</GETFEATUREINFO>', 'text/xml')).toEqual([]);
  });

  it('reports a real service exception as an error', () => {
    expect(() => parseFeatureInfo('<ServiceExceptionReport><ServiceException>Internal error</ServiceException></ServiceExceptionReport>', 'text/xml')).toThrow();
  });

  it('never carries markup into values', () => {
    const [record] = parseFeatureInfo('<table><tr><th>Opis</th><td><b>bold</b> <script>alert(1)</script>text</td></tr></table>', 'text/html');
    expect(record.fields[0].value).toBe('bold text');
  });
});

describe('queryLayers', () => {
  it('keeps only queryable sublayers visible at the scale, and everything without metadata', async () => {
    await withCapabilities();
    const kieg = OVERLAY_BY_ID.get('kieg')!;
    expect(queryLayers(kieg, ['obreby', 'dzialki', 'budynki', 'numery_dzialek'], 5000)).toEqual(['dzialki']);
    expect(queryLayers(kieg, ['obreby', 'dzialki'], 15000)).toEqual(['obreby']);
    expect(queryLayers(OVERLAY_BY_ID.get('pog')!, ['strefaPlanistyczna'], 5000)).toEqual(['strefaPlanistyczna']);
  });
});

describe('fetchFeatureInfo', () => {
  it('asks the proxy with the layers it was given and the preferred format', async () => {
    await withCapabilities();
    const { calls } = stubFetch([['/api/capabilities', {}], ['/api/featureinfo/kieg', KIEG_XML, { headers: { 'X-Upstream-Content-Type': 'text/xml' } }]]);
    const kieg = OVERLAY_BY_ID.get('kieg')!;
    const source = new ImageWMS({ url: kieg.url, params: { LAYERS: '' }, projection: EPSG2180 });
    const records = await fetchFeatureInfo(kieg, source, [656849, 482462], 0.5, ['dzialki'], new AbortController().signal);
    const url = new URL(calls.at(-1)!, 'http://localhost');
    expect(url.pathname).toBe('/api/featureinfo/kieg');
    expect(url.searchParams.get('QUERY_LAYERS')).toBe('dzialki');
    expect(url.searchParams.get('LAYERS')).toBe('dzialki');
    expect(url.searchParams.get('INFO_FORMAT')).toBe('text/xml');
    expect(url.searchParams.get('CRS')).toBe('EPSG:2180');
    expect(records[0].fields[0].value).toBe('141708_2.0021.22/1');
  });

  it('turns a proxy error status into an exception', async () => {
    await withCapabilities();
    stubFetch([['/api/featureinfo/', 'busy', { status: 503 }]]);
    const kieg = OVERLAY_BY_ID.get('kieg')!;
    const source = new ImageWMS({ url: kieg.url, params: { LAYERS: '' }, projection: EPSG2180 });
    await expect(fetchFeatureInfo(kieg, source, [1, 2], 1, ['dzialki'], new AbortController().signal)).rejects.toThrow('HTTP 503');
  });
});
