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
    setSearch('?t=2007&c=1');
    expect(readUrl()).toMatchObject({ time: '2007', compare: true });
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
    writeUrl({ center: [1, 2], zoom: 3, base: 'orto', overlays: [], sublayers: {}, time: '2007-01-01' });
    vi.advanceTimersByTime(300);
    expect(window.location.search).toBe('?x=1&y=2&z=3.0&b=orto&l=&t=2007-01-01');
    writeUrl({ center: [1, 2], zoom: 3, base: 'orto', overlays: [], sublayers: {}, time: '2007-01-01', compare: true });
    vi.advanceTimersByTime(300);
    expect(window.location.search).toBe('?x=1&y=2&z=3.0&b=orto&l=&t=2007-01-01&c=1');
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

  it('round-trips through readUrl', () => {
    vi.useFakeTimers();
    const state = {
      center: [500000, 465000] as [number, number],
      zoom: 3,
      base: 'teren',
      overlays: ['rcn'],
      sublayers: { rcn: ['dzialki'] },
    };
    writeUrl(state);
    vi.advanceTimersByTime(300);
    expect(readUrl()).toEqual(state);
    vi.useRealTimers();
  });
});
