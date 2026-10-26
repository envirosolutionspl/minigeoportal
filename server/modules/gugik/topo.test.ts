import { describe, expect, it, vi } from 'vitest';
import { RequestError } from '../../http.ts';
import { parseIndex, topoAt } from './topo.ts';

const sheet = (godlo: string, system: string, rows: Record<string, string>) => `<table class="styled-table">
  <thead><tr><th colspan="2">Arkusz ${godlo} Układ PL-${system}</th></tr></thead>
  <tbody>
    <tr><th style="text-align:left">Godło:</th> <td><a >${godlo}</td></tr>
    ${Object.entries(rows)
      .map(([k, v]) => `<tr><th style="text-align:left">${k}:</th> <td>${v}</td></tr>`)
      .join('\n')}
    <tr><th style="text-align:left">Informacje o danych:</th><td><a href="https://www.geoportal.gov.pl/dane/mapy" target="_blank">Zobacz</a></td></tr>
  </tbody>
</table>`;

const PAGE = [
  sheet('N-34-139-A-c-1', '1942', { 'Nazwa arkusza': 'Warszawa - Środmieście', Skala: '1:10 000', 'Aktualność kartograficzna': '1993' }),
  sheet('263.344', '1965', { 'Nazwa arkusza': 'Warszawa-Śródmieście', Skala: '1:10 000', 'Aktualność kartograficzna': '1982' }),
  sheet('263.34', '1965', { Skala: '1:25 000', 'Aktualność kartograficzna': '1982' }),
  sheet('N-34-139-A', '1992', { Skala: '1:50 000', 'Aktualność kartograficzna': 'brak' }),
  sheet('X', '1980', { Skala: '1:100 000', 'Aktualność kartograficzna': '1985' }),
].join('\n');

describe('parseIndex', () => {
  it('reads the sheets with a known system and scale and a year, and skips the rest', () => {
    expect(parseIndex(PAGE)).toEqual([
      { date: '1993', scale: 10000, system: '1942', layer: 'Raster_10_1942', sheet: 'N-34-139-A-c-1', name: 'Warszawa - Środmieście' },
      { date: '1982', scale: 10000, system: '1965', layer: 'Raster_10_1965', sheet: '263.344', name: 'Warszawa-Śródmieście' },
      { date: '1982', scale: 25000, system: '1965', layer: 'Raster_25_1965', sheet: '263.34' },
    ]);
    expect(parseIndex('<p>nothing</p>')).toEqual([]);
  });
});

describe('topoAt', () => {
  it('refuses points outside Poland without asking upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(topoAt('1', '2')).rejects.toThrow(RequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the index at the point, northing first, and sorts the sheets by date, coarser first on a day', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(PAGE, { headers: { 'content-type': 'text/html' } });
      }),
    );
    const info = await topoAt('639000', '487000');
    expect(calls[0]).toContain('SkorowidzMapTopograficznych?');
    expect(calls[0]).toContain('BBOX=486999.00%2C638999.00%2C487001.00%2C639001.00');
    expect(calls[0]).toContain('QUERY_LAYERS=topo_10_42%2Ctopo_10_65%2Ctopo_10_92%2Ctopo_25_65%2Ctopo_50_42%2Ctopo_50_65%2Ctopo_50_92');
    expect(info.sheets.map((s) => `${s.date} ${s.scale}`)).toEqual(['1982 25000', '1982 10000', '1993 10000']);
  });
});
