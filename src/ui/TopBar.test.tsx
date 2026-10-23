import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TopBar } from './TopBar';
import { useMapStore } from '@/state/store';
import { clearUnitNames } from '@/services/units';
import { stubFetch } from '@/test/helpers';

const UUG = {
  type: 'city',
  results: {
    1: { city: 'Komaszyce', teryt: '040704', x: '454776', y: '546382' },
    2: { city: 'Komaszyce', teryt: '260502', x: '601729', y: '376839' },
  },
};

beforeEach(() => {
  clearUnitNames();
  useMapStore.setState({ focus: null, tool: 'none' });
  stubFetch([
    ['services.gugik.gov.pl/uug', UUG],
    ['/api/dict/jednostki', {}],
  ]);
});

const type = async (text: string) => {
  const box = screen.getByRole('combobox');
  fireEvent.change(box, { target: { value: text } });
  // Debounce and the stubbed answers.
  await act(() => new Promise((r) => setTimeout(r, 400)));
  return box;
};

describe('search box', () => {
  it('is a combobox: arrows move through the results, Enter shows the chosen one', async () => {
    render(<TopBar />);
    const box = await type('komaszyce');
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByText(/^Wyników: 2\./)).toBeTruthy();

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-activedescendant')).toBe('search-hit-1');
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-activedescendant')).toBe('search-hit-0');

    fireEvent.keyDown(box, { key: 'ArrowUp' });
    fireEvent.keyDown(box, { key: 'Enter' });
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(useMapStore.getState().focus).toMatchObject({ center: [601729, 376839] });
    // Writing the chosen name into the box is not a new search: the list stays closed.
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect((box as HTMLInputElement).value).toBe('Komaszyce');
    expect(box.getAttribute('aria-expanded')).toBe('false');
  });

  it('finds coordinates typed in, without asking the search services', async () => {
    const { calls } = stubFetch([]);
    render(<TopBar />);
    const box = await type('52,2318 21,0067');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(calls).toEqual([]);
    fireEvent.keyDown(box, { key: 'Enter' });
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(useMapStore.getState().focus?.center?.[0]).toBeCloseTo(637000, -2);
  });

  it('closes the list with Escape and says when nothing was found', async () => {
    render(<TopBar />);
    const box = await type('Komaszyce');
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.getAttribute('aria-expanded')).toBe('false');
    stubFetch([['services.gugik.gov.pl/uug', { type: 'city', results: {} }]]);
    await type('Xyzzyx');
    expect(screen.getByText('Brak wyników.')).toBeTruthy();
  });
});

describe('copy link', () => {
  it('copies a link to this view with the base map and the layers that are on', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    useMapStore.setState({
      center: [656849.4, 482462.6],
      zoom: 13,
      base: 'orto',
      overlays: ['kieg', 'kiut'],
      sublayers: { kiut: ['przewod_gazowy'] },
    });
    render(<TopBar />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Kopiuj link do tego widoku mapy' }));
    });
    expect(writeText).toHaveBeenCalledWith(
      `${location.origin}${location.pathname}?x=656849&y=482463&z=13.0&b=orto&l=kieg,kiut.przewod_gazowy`,
    );
    expect(screen.getByText('Skopiowano link do tego widoku mapy.')).toBeTruthy();
  });

  it('shows the link to copy by hand when the clipboard is not available', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async () => Promise.reject(new Error('denied')) } });
    render(<TopBar />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Kopiuj link do tego widoku mapy' }));
    });
    expect(screen.getByText(new RegExp(`^${location.origin.replace(/[.:/]/g, '\\$&')}.*\\?x=`))).toBeTruthy();
  });
});

describe('map tools', () => {
  it('lists the tools from layers at the top to help at the bottom', () => {
    const { container } = render(<TopBar />);
    const labels = [...container.querySelectorAll('.map-tools > button, .map-tools > div > button')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(labels).toEqual([
      'Warstwy',
      'Moja lokalizacja',
      'Więcej',
      'Pomiar odległości i powierzchni',
      'Kopiuj link do tego widoku mapy',
      'Drukuj mapę',
      'Ułatwienia: wielkość tekstu i kontrast',
      'O serwisie',
    ]);
  });
});

describe('tools on phones', () => {
  it('keeps layers, location and "More" on the map, the rest in the sheet', () => {
    const { container } = render(<TopBar />);
    const onPhone = [...container.querySelectorAll<HTMLElement>('.map-tools > button, .map-tools > div')]
      .filter((el) => !el.className.includes('phone:hidden'))
      .map((el) => (el.matches('button') ? el : el.querySelector('button'))?.getAttribute('aria-label'));
    expect(onPhone).toEqual(['Warstwy', 'Moja lokalizacja', 'Więcej']);
    const more = screen.getByRole('button', { name: 'Więcej' });
    expect(more.parentElement?.className).toContain('phone:block');
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('search bar type', () => {
  it('uses one text size for the field and the parcel toggle from sm up, 16 px on phones', () => {
    render(<TopBar />);
    const field = screen.getByRole('combobox', { name: 'Szukaj adresu, miejscowości lub działki' });
    const toggle = screen.getByRole('button', { name: 'Znajdź działkę po numerze i obrębie' });
    // Phones keep 16 px so iOS does not zoom into the field; the toggle's label is hidden there.
    expect(field.className).toMatch(/(^|\s)text-base(\s|$)/);
    expect(field.className).toMatch(/(^|\s)sm:text-sm(\s|$)/);
    expect(toggle.className).toMatch(/(^|\s)text-sm(\s|$)/);
  });
});
