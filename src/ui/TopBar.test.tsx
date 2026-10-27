import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { TopBar } from './TopBar';
import { useMapStore } from '@/state/store';
import { clearUnitNames } from '@/modules/gugik/units';
import { stubFetch } from '@/test/helpers';

const UUG = {
  type: 'city',
  results: {
    1: { city: 'Komaszyce', teryt: '040704', x: '454776', y: '546382' },
    2: { city: 'Komaszyce', teryt: '260502', x: '601729', y: '376839' },
  },
};

beforeEach(() => {
  // The search waits 300 ms after the last keystroke, and messages go by themselves: no real waiting.
  vi.useFakeTimers();
  clearUnitNames();
  useMapStore.setState({ focus: null, tool: 'none' });
  stubFetch([
    ['services.gugik.gov.pl/uug', UUG],
    ['/api/dict/jednostki', {}],
  ]);
});

afterEach(() => vi.useRealTimers());

/** Lets the given time pass, with the stubbed answers that come in it. */
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

const type = async (text: string) => {
  const box = screen.getByRole('combobox');
  fireEvent.change(box, { target: { value: text } });
  // The debounce, then the stubbed answers.
  await wait(300);
  return box;
};

describe('search box', () => {
  it('says that Enter needs at least three characters, instead of doing nothing', () => {
    render(<TopBar />);
    const box = screen.getByRole('combobox');
    fireEvent.change(box, { target: { value: 'Kr' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByText('Wpisz co najmniej 3 znaki.')).toBeTruthy();
  });

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
    await wait(50);
    expect(useMapStore.getState().focus).toMatchObject({ center: [601729, 376839] });
    // Writing the chosen name into the box is not a new search: the list stays closed.
    await wait(400);
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
    await wait(50);
    expect(useMapStore.getState().focus?.center?.[0]).toBeCloseTo(637000, -2);
  });

  it('closes the list with Escape, and shows and says when nothing was found', async () => {
    render(<TopBar />);
    const box = await type('Komaszyce');
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.getAttribute('aria-expanded')).toBe('false');
    stubFetch([['services.gugik.gov.pl/uug', { type: 'city', results: {} }]]);
    await type('Xyzzyx');
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(within(screen.getByRole('listbox')).getByText('Brak wyników.')).toBeTruthy();
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Brak wyników.')).toBe(true);
    // A shorter text takes the message away with the list.
    await type('Xy');
    expect(box.getAttribute('aria-expanded')).toBe('false');
  });

  it('gives the clear and the parcel buttons most of the bar to tap on a phone', () => {
    render(<TopBar />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Kr' } });
    expect(screen.getByRole('button', { name: 'Wyczyść' }).className).toMatch(/\bh-9 w-9\b/);
    expect(screen.getByRole('button', { name: 'Działka: znajdź po numerze i obrębie' }).className).toMatch(/\bmin-h-9 min-w-9\b/);
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
      'Profil terenu',
      'Podróż w czasie',
      'Kopiuj link do tego widoku mapy',
      'Drukuj mapę',
      'Ułatwienia: wielkość tekstu i kontrast',
      'O serwisie',
    ]);
  });
});

describe('a slow search', () => {
  it('shows and says that it is searching until the answer comes', async () => {
    const { searchProvider } = await import('@/search');
    let answer: (hits: never[]) => void = () => {};
    vi.spyOn(searchProvider, 'search').mockReturnValue(new Promise((r) => (answer = r)));
    const { container } = render(<TopBar />);
    const spinner = () => container.querySelector('.search-box .animate-spin');
    expect(spinner()).toBeNull();
    await type('Kraków');
    expect(spinner()).not.toBeNull();
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Szukam…')).toBe(true);
    // Seen too, in the list that opens as the search starts.
    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('true');
    expect(within(screen.getByRole('listbox')).getByText('Szukam…')).toBeTruthy();
    await act(async () => answer([]));
    expect(spinner()).toBeNull();
    expect(screen.getAllByRole('status').some((s) => s.textContent === 'Brak wyników.')).toBe(true);
  });
});

describe('a service that did not answer', () => {
  it('is named under the results, also when nothing was found', async () => {
    const { searchProvider } = await import('@/search');
    vi.spyOn(searchProvider, 'search').mockResolvedValue(Object.assign([], { unavailable: ['wyszukiwarka adresów (UUG)'] }));
    render(<TopBar />);
    await type('Kraków');
    expect(screen.getByRole('listbox').textContent).toContain('Nie odpowiada: wyszukiwarka adresów (UUG). Wyniki mogą być niepełne.');
    expect(screen.getAllByRole('status').some((s) => s.textContent?.includes('Wyniki mogą być niepełne'))).toBe(true);
  });
});

describe('my location', () => {
  type Geo = Pick<Geolocation, 'getCurrentPosition'>;
  const withGeolocation = (geolocation: Geo | undefined) => vi.stubGlobal('navigator', { ...navigator, geolocation });
  const press = () => fireEvent.click(screen.getByRole('button', { name: 'Moja lokalizacja' }));
  const notice = () =>
    screen
      .getAllByRole('status')
      .map((s) => s.textContent)
      .join(' ');
  const refused = (code: number) =>
    ({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: '' }) as GeolocationPositionError;

  it('zooms to the position when the visitor allows it', () => {
    withGeolocation({
      getCurrentPosition: (ok) => ok({ coords: { latitude: 52.2297, longitude: 21.0122 } } as GeolocationPosition),
    });
    render(<TopBar />);
    press();
    const focus = useMapStore.getState().focus!;
    expect(focus.center![0]).toBeCloseTo(637382, 0);
    expect(focus.center![1]).toBeCloseTo(486757, 0);
    expect(notice()).not.toContain('lokalizac');
  });

  it('says that it is finding the position until the browser has it', () => {
    let found: PositionCallback = () => {};
    withGeolocation({ getCurrentPosition: (ok) => void (found = ok) });
    render(<TopBar />);
    press();
    expect(notice()).toContain('Ustalam położenie…');
    act(() => found({ coords: { latitude: 52.2297, longitude: 21.0122 } } as GeolocationPosition));
    expect(notice()).not.toContain('Ustalam');
    expect(useMapStore.getState().focus).not.toBeNull();
  });

  it('says to allow location by hand only when the browser refuses without asking', () => {
    let wait = 0;
    let code = 1;
    // The refusal comes `wait` ms after the request: at once when the browser no longer asks.
    withGeolocation({
      getCurrentPosition: (_, fail) => {
        const at = performance.now() + wait;
        vi.spyOn(performance, 'now').mockReturnValue(at);
        fail!(refused(code));
        vi.mocked(performance.now).mockRestore();
      },
    });
    render(<TopBar />);
    // A prompt the visitor answered or closed: their choice, nothing to say.
    wait = 3000;
    press();
    expect(notice()).not.toContain('Lokalizacja');
    // Then the browser no longer asks.
    wait = 5;
    press();
    expect(notice()).toContain('Lokalizacja jest zablokowana dla tej strony');
    expect(useMapStore.getState().focus).toBeNull();
    code = 3;
    press();
    expect(notice()).toContain('Nie udało się ustalić położenia');
  });

  it('shows a message that goes by itself, stays while pointed at, and closes with its button', () => {
    withGeolocation(undefined);
    render(<TopBar />);
    press();
    const box = screen.getAllByRole('status').find((s) => s.textContent?.includes('położenia'))!;
    fireEvent.pointerEnter(box, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(20000));
    expect(notice()).toContain('Nie udało się ustalić położenia');
    fireEvent.pointerLeave(box, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(9000));
    expect(notice()).not.toContain('położenia');
    press();
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    expect(notice()).not.toContain('położenia');
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
    // No printing from a phone: the sheet lists every other tool, in the order of the computer's
    // column, with the whole area (a map button on a computer) and the display aids folded in.
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.queryByRole('button', { name: 'Drukuj mapę' })).toBeNull();
    expect(sheet.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Pomiar odległości i powierzchni',
      'Profil terenu',
      'Podróż w czasie',
      'Kopiuj link do tego widoku mapy',
      'Cała Polska',
      'O serwisie',
      'Ułatwienia',
    ]);
    // The top bar lets taps through to the map; the sheet inside it must take them back.
    expect(container.querySelector('.pointer-events-none')?.contains(screen.getByRole('dialog'))).toBe(true);
    expect(screen.getByRole('dialog').className).toContain('pointer-events-auto');
  });
});

describe('search bar type', () => {
  it('uses one text size for the field and the parcel toggle from sm up, 16 px on phones', () => {
    render(<TopBar />);
    const field = screen.getByRole('combobox', { name: 'Szukaj adresu, miejscowości lub działki' });
    const toggle = screen.getByRole('button', { name: 'Działka: znajdź po numerze i obrębie' });
    // Phones keep 16 px so iOS does not zoom into the field; the toggle's label is hidden there.
    expect(field.className).toMatch(/(^|\s)text-base(\s|$)/);
    expect(field.className).toMatch(/(^|\s)sm:text-sm(\s|$)/);
    expect(toggle.className).toMatch(/(^|\s)text-sm(\s|$)/);
  });
});
