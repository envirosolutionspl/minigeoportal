import { describe, expect, it, vi } from 'vitest';
import { linkFor, readUrl, writeUrl } from './url';

const setSearch = (search: string) => window.history.replaceState(null, '', `/${search}`);

describe('readUrl', () => {
  it('reads a complete state', () => {
    setSearch('?x=637000&y=486000&z=12.5&b=mapa&l=kieg,kiut.przewod_wodociagowy.przewod_gazowy');
    expect(readUrl()).toEqual({
      center: [637000, 486000],
      zoom: 12.5,
      base: 'mapa',
      overlays: ['kieg', 'kiut'],
      sublayers: { kiut: ['przewod_wodociagowy', 'przewod_gazowy'] },
    });
  });

  it('reads the date of the time view, when it looks like one', () => {
    setSearch('?x=1&y=2&t=2007-01-01');
    expect(readUrl().time).toBe('2007-01-01');
    setSearch('?t=2007&c=1&tl=mapy-dawne');
    expect(readUrl()).toMatchObject({ time: '2007', compare: true, timeLayer: 'mapy-dawne' });
    setSearch('?t=2007&tl=../x');
    expect(readUrl().timeLayer).toBeUndefined();
    setSearch('?t=yesterday&c=1');
    expect(readUrl().time).toBeUndefined();
    expect(readUrl().compare).toBeUndefined();
  });

  it('ignores missing or malformed values', () => {
    setSearch('?x=abc&y=1&z=&b=');
    expect(readUrl()).toEqual({});
    setSearch('?z=0');
    expect(readUrl()).toEqual({ zoom: 0 });
    setSearch('');
    expect(readUrl()).toEqual({});
  });

  it('treats an empty layer list as "no overlays", distinct from "not given"', () => {
    setSearch('?l=');
    expect(readUrl()).toEqual({ overlays: [], sublayers: {} });
  });
});

describe('writeUrl', () => {
  it('writes the state after a short delay, rounding coordinates and keeping commas readable', () => {
    vi.useFakeTimers();
    setSearch('');
    writeUrl({
      center: [637000.6, 486000.2],
      zoom: 12.345,
      base: 'orto',
      overlays: ['kieg', 'kiut'],
      sublayers: { kiut: ['przewod_gazowy'] },
    });
    expect(window.location.search).toBe('');
    vi.advanceTimersByTime(300);
    expect(window.location.search).toBe('?x=637001&y=486000&z=12.3&b=orto&l=kieg,kiut.przewod_gazowy');
    vi.useRealTimers();
  });

  it('writes the date, the comparison and the layer of the time view, and reads them back', () => {
    vi.useFakeTimers();
    const view = { center: [1, 2] as [number, number], zoom: 3, base: 'orto', overlays: [], sublayers: {} };
    writeUrl({ ...view, time: '2007-01-01' });
    vi.advanceTimersByTime(300);
    expect(window.location.search).toBe('?x=1&y=2&z=3.0&b=orto&l=&t=2007-01-01');
    const state = { ...view, time: '1965', compare: true, timeLayer: 'mapy-dawne' };
    writeUrl(state);
    vi.advanceTimersByTime(300);
    expect(window.location.search).toBe('?x=1&y=2&z=3.0&b=orto&l=&t=1965&c=1&tl=mapy-dawne');
    expect(readUrl()).toEqual(state);
    setSearch('');
    vi.useRealTimers();
  });

  it('keeps the language of the page (its address, /en/) in the page and in shared links', () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', '/en/');
    const state = { center: [1, 2] as [number, number], zoom: 3, base: 'orto', overlays: [], sublayers: {} };
    writeUrl(state);
    vi.advanceTimersByTime(300);
    expect(window.location.pathname + window.location.search).toBe('/en/?x=1&y=2&z=3.0&b=orto&l=');
    expect(linkFor(state)).toBe(`${window.location.origin}/en/?x=1&y=2&z=3.0&b=orto&l=`);
    setSearch('');
    vi.useRealTimers();
  });

  it('keeps a dot inside a layer name apart from the dots between names', () => {
    vi.useFakeTimers();
    const state = {
      center: [1, 2] as [number, number],
      zoom: 3,
      base: 'orto',
      overlays: ['ms.Gleby'],
      sublayers: { 'ms.Gleby': ['a.b', 'c'] },
    };
    writeUrl(state);
    vi.advanceTimersByTime(300);
    expect(window.location.search).toBe('?x=1&y=2&z=3.0&b=orto&l=ms%252EGleby.a%252Eb.c');
    expect(readUrl()).toEqual(state);
    setSearch('');
    vi.useRealTimers();
  });
});
