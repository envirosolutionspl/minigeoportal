import { describe, expect, it, vi } from 'vitest';
import { RequestError } from '../../http.ts';
import { latestPhoto, orthoAt, parseIndex } from './ortho.ts';

const record = (fields: Record<string, string>) =>
  `skorDo5cm.push({${Object.entries(fields)
    .map(([k, v]) => `${k}:"${v}"`)
    .join(', ')}});`;

const PAGE = `<html><script>
var skorDo5cm = [];
${record({ url: 'https://opendata.geoportal.gov.pl/ortofotomapa/1/a.tif', godlo: 'N-34-138-B-d-2-4', aktualnosc: '2025-04-27', wielkoscPiksela: '0.05', kolor: 'RGB', rozmiarPlikuMB: '1026' })}
var skorDo5cm = [];
${record({ url: 'https://opendata.geoportal.gov.pl/ortofotomapa/2/b.tif', godlo: 'N-34-138-B-d-2-4', aktualnosc: '2025-04-27', wielkoscPiksela: '0.25', kolor: 'RGB', rozmiarPlikuMB: '45' })}
${record({ url: 'https://opendata.geoportal.gov.pl/ortofotomapa/3/c.tif', godlo: 'N-34-138-B-d-2-4', aktualnosc: '2025-06-01', wielkoscPiksela: '0.25', kolor: 'CIR' })}
${record({ url: 'https://evil.example/x.tif', godlo: 'X', aktualnosc: '2001-05-13', wielkoscPiksela: '0.75', kolor: 'RGB' })}
${record({ godlo: 'broken', aktualnosc: 'yesterday', wielkoscPiksela: '0.1', kolor: 'RGB' })}
</script></html>`;

describe('parseIndex', () => {
  it('reads sheet records, keeps only safe download links and skips malformed ones', () => {
    const sheets = parseIndex(PAGE);
    expect(sheets).toHaveLength(4);
    expect(sheets[0]).toEqual({
      date: '2025-04-27',
      pixel: 0.05,
      color: 'RGB',
      sheet: 'N-34-138-B-d-2-4',
      download: 'https://opendata.geoportal.gov.pl/ortofotomapa/1/a.tif',
      sizeMb: 1026,
    });
    expect(sheets[3].download).toBeUndefined();
    expect(parseIndex('<p>nothing</p>')).toEqual([]);
  });
});

describe('latestPhoto', () => {
  it('picks the newest natural-colour photo, the sharpest of that day', () => {
    expect(latestPhoto(parseIndex(PAGE))).toMatchObject({ date: '2025-04-27', pixel: 0.05 });
    expect(latestPhoto([])).toBeUndefined();
  });
});

describe('orthoAt', () => {
  it('refuses points outside Poland without asking upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(orthoAt('1', '2')).rejects.toThrow(RequestError);
    await expect(orthoAt('abc', '486500')).rejects.toThrow(RequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the index at the point, northing first, with the year layers from its capabilities', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes('GetCapabilities')) {
          return new Response(
            '<Name>SkorowidzeOrtofotomapy2027</Name><Name>SkorowidzeOrtofotomapyZasiegi2027</Name><Name>SkorowidzeOrtofotomapyStarsze</Name>',
          );
        }
        return new Response(PAGE);
      }),
    );
    expect(await orthoAt('636500', '486500')).toEqual({ latest: expect.objectContaining({ pixel: 0.05 }), archived: 4 });
    const query = new URL(calls.at(-1)!).searchParams;
    expect(query.get('LAYERS')).toBe('SkorowidzeOrtofotomapy2027,SkorowidzeOrtofotomapyStarsze');
    expect(query.get('BBOX')).toBe('486499.00,636499.00,486501.00,636501.00');
  });
});
