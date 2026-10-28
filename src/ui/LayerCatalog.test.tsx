import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LayerCatalog } from './LayerCatalog';
import { useMapStore } from '@/state/store';
import { useStatusStore } from '@/services/status';
import { stubFetch, withCapabilities } from '@/test/helpers';
import { clearCatalog } from '@/services/catalog';

// The capabilities stay loaded across the tests: nothing here clears them. The geoportal list is
// asked anew by each test, from the server's answer below unless a test gives another.
beforeAll(() => withCapabilities());

beforeEach(() => {
  useMapStore.setState({ overlays: ['kieg'], sublayers: {}, opacity: {}, panel: 'catalog', scale: 47247 });
  useStatusStore.setState({ status: {}, slow: [] });
  clearCatalog();
  stubFetch([['/api/catalog', CATALOG]]);
});

/** The header of a topic section of the full list (the topic chips above have the same names). */
const section = (name: RegExp) =>
  waitFor(() => {
    const header = screen.getAllByRole('button', { name }).find((b) => b.hasAttribute('aria-expanded'));
    if (!header) throw new Error(`No section ${name}`);
    return header;
  });

/** The geoportal list as the server sends it: one layer we draw ourselves, two others, one refused. */
const CATALOG = {
  generatedAt: 'x',
  entries: [
    {
      id: 'msKIEG',
      title: 'Ewidencja gruntów i budynków',
      path: [],
      topic: 'dzialki',
      kind: 'wms',
      order: 0,
      status: 'ok',
      checked: '2026-10-22T08:00:00Z',
      curated: 'kieg',
    },
    {
      id: 'msZabytki',
      title: 'Rejestr zabytków nieruchomych',
      path: ['Dane innych instytucji', 'Narodowy Instytut Dziedzictwa'],
      topic: 'zabytki',
      kind: 'wms',
      order: 5,
      status: 'ok',
      checked: '2026-10-22T08:00:00Z',
    },
    {
      id: 'msCLC',
      title: 'Corine Land Cover 2018',
      path: ['GIOŚ'],
      topic: 'srodowisko',
      kind: 'wms',
      order: 6,
      status: 'refused',
      detail: 'HTTP 403',
      checked: '2026-10-22T08:00:00Z',
    },
    {
      id: 'msEGM',
      title: 'EuroGlobalMap',
      path: [],
      topic: 'teren',
      kind: 'rest',
      order: 7,
      status: 'unsupported',
      checked: '2026-10-22T08:00:00Z',
    },
    {
      id: 'msArcheo',
      title: 'Archeologia',
      path: [],
      topic: 'zabytki',
      kind: 'wms',
      order: 8,
      status: 'ok',
      checked: '2026-10-22T08:00:00Z',
    },
  ],
};

describe('LayerCatalog', () => {
  it('lists starters first, then every geoportal layer by topic, without repeating our own', async () => {
    render(<LayerCatalog />);
    expect(screen.getByText('Najpopularniejsze')).toBeTruthy();
    expect(screen.getByLabelText('Plany ogólne gmin (POG)')).toBeTruthy();
    const zabytki = await section(/Zabytki i turystyka/);
    fireEvent.click(zabytki);
    expect(screen.getByLabelText('Rejestr zabytków nieruchomych')).toBeTruthy();
    expect(screen.getByText('Dane innych instytucji › Narodowy Instytut Dziedzictwa')).toBeTruthy();
    // Our own entry stands for msKIEG, so it is listed once.
    expect(screen.getAllByLabelText('Ewidencja gruntów i budynków')).toHaveLength(1);
    // The topic lists the geoportal layers by title, not in the order the server sent them.
    const listed = [...zabytki.parentElement!.querySelectorAll('input[type=checkbox]')].map((i) => i.getAttribute('aria-label'));
    expect(listed).toEqual(['Archeologia', 'Rejestr zabytków nieruchomych']);
  });

  it('puts focus on its heading when it opens, not on the search field, without scrolling the app', () => {
    useMapStore.setState({ panel: 'none' });
    render(<LayerCatalog />);
    expect(document.activeElement).toBe(document.body);
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    act(() => useMapStore.getState().setPanel('catalog'));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Warstwy' }));
    // The panel still slides in from below the screen: scrolling to its heading would shift the
    // whole app and leave the list at half the screen on a phone.
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });

  it('gives the close button, the chevrons and the topic chips room for a finger on a phone', () => {
    render(<LayerCatalog />);
    const close = screen.getByRole('button', { name: 'Zamknij' }).className;
    expect(close).toContain('phone:h-11');
    expect(close).toContain('phone:w-11');
    expect(screen.getByRole('button', { name: 'Warstwy usługi: Ewidencja gruntów i budynków' }).className).toContain('phone:p-2.5');
    expect(screen.getByRole('button', { name: 'Ceny' }).className).toContain('phone:py-2');
    expect(screen.getByRole('button', { name: 'Tylko włączone (1)' }).className).toContain('phone:py-2');
  });

  it('keeps unavailable layers in their topic, greyed out, with the reason on request', async () => {
    render(<LayerCatalog />);
    fireEvent.click(await section(/Środowisko/));
    const clc = screen.getByLabelText('Corine Land Cover 2018') as HTMLInputElement;
    expect(clc.disabled).toBe(true);
    const item = clc.closest('.rounded-xl') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Niedostępna u nas. Dlaczego?' }));
    expect(screen.getByText('Serwer tej usługi odrzuca zapytania spoza geoportal.gov.pl.')).toBeTruthy();
    expect(screen.getByText(/Odpowiedź serwera: HTTP 403\. Sprawdzono 22\.10\.2026\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Zobacz w geoportal.gov.pl/ })).toBeTruthy();
  });

  it('finds geoportal layers by name or group and switches them on', async () => {
    render(<LayerCatalog />);
    await section(/Zabytki i turystyka/);
    const find = (value: string) => fireEvent.change(screen.getByPlaceholderText(/Szukaj warstwy/), { target: { value } });
    find('zabytkow nieruch');
    expect(screen.getByLabelText('Rejestr zabytków nieruchomych')).toBeTruthy();
    // By the name of its group.
    find('dziedzictwa');
    fireEvent.click(screen.getByLabelText('Rejestr zabytków nieruchomych'));
    expect(useMapStore.getState().overlays).toContain('msZabytki');
    expect(screen.getByText('Wczytuję warstwę…')).toBeTruthy();
  });

  it('lets one sublayer of a big geoportal layer be chosen before switching it on', async () => {
    const big = { ...CATALOG, entries: CATALOG.entries.map((e) => (e.id === 'msZabytki' ? { ...e, parts: 2 } : e)) };
    const entry = { ...big.entries[1], modules: [], url: 'https://nid.example/wms' };
    const meta = {
      kind: 'wms',
      fetchedAt: 'x',
      title: 'NID',
      infoFormats: [],
      layers: { nieruchome: { title: 'Nieruchome', queryable: true }, ruchome: { title: 'Ruchome', queryable: true } },
    };
    stubFetch([
      ['/api/catalog/msZabytki', { entry, meta }],
      ['/api/catalog', big],
    ]);
    render(<LayerCatalog />);
    fireEvent.click(await section(/Zabytki i turystyka/));
    fireEvent.click(screen.getByRole('button', { name: 'Warstwy usługi: Rejestr zabytków nieruchomych' }));
    fireEvent.click(await screen.findByLabelText('Rejestr zabytków nieruchomych: Ruchome'));
    expect(useMapStore.getState().overlays).toContain('msZabytki');
    expect(useMapStore.getState().sublayers.msZabytki).toEqual(['ruchome']);
  });

  it('shows only the layers switched on, ours and the geoportal ones, when asked', async () => {
    useMapStore.setState({ overlays: ['kieg', 'msZabytki'] });
    render(<LayerCatalog />);
    await section(/Zabytki i turystyka/);
    fireEvent.click(screen.getByRole('button', { name: 'Tylko włączone (2)' }));
    expect(screen.getByText('Włączone warstwy')).toBeTruthy();
    expect(screen.getByLabelText('Ewidencja gruntów i budynków')).toBeTruthy();
    expect(screen.getByLabelText('Rejestr zabytków nieruchomych')).toBeTruthy();
    expect(screen.queryByLabelText('Plany ogólne gmin (POG)')).toBeNull();
    expect(screen.queryByLabelText('Corine Land Cover 2018')).toBeNull();

    // Nothing on: the panel says so.
    act(() => useMapStore.setState({ overlays: [] }));
    expect(screen.getByText('Żadna warstwa nie jest włączona.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tylko włączone (0)' }));
    expect(screen.getByText('Najpopularniejsze')).toBeTruthy();
  });

  it('says when the full list is still being prepared', async () => {
    stubFetch([['/api/catalog', 'Catalog not ready yet', { status: 503 }]]);
    render(<LayerCatalog />);
    expect(await screen.findByText(/jest w przygotowaniu/)).toBeTruthy();
    expect(screen.getByLabelText('Plany ogólne gmin (POG)')).toBeTruthy();
  });

  it('finds a sublayer by text, ignoring diacritics, and highlights it', () => {
    const { container } = render(<LayerCatalog />);
    fireEvent.change(screen.getByPlaceholderText(/Szukaj warstwy/), { target: { value: 'kanalizacja' } });
    const row = screen.getByLabelText('Uzbrojenie terenu: Kanalizacja').closest('li')!;
    expect(row.className).toContain('font-medium');
    expect(container.querySelectorAll('li.font-medium')).toHaveLength(1);
    expect(screen.queryByLabelText('Ewidencja gruntów i budynków')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Szukaj warstwy/), { target: { value: 'dzialki' } });
    expect(screen.getByLabelText('Ewidencja gruntów i budynków')).toBeTruthy();
  });

  it('clears the layer search with one click', () => {
    render(<LayerCatalog />);
    expect(screen.queryByRole('button', { name: 'Wyczyść wyszukiwanie' })).toBeNull();
    const search = screen.getByPlaceholderText(/Szukaj warstwy/) as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'kanalizacja' } });
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść wyszukiwanie' }));
    expect(search.value).toBe('');
    expect(screen.getByText('Najpopularniejsze')).toBeTruthy();
  });

  it('filters by topic chip', () => {
    render(<LayerCatalog />);
    fireEvent.click(screen.getByRole('button', { name: 'Ceny' }));
    expect(screen.getByLabelText('Ceny transakcyjne (RCN)')).toBeTruthy();
    expect(screen.queryByLabelText('Uzbrojenie terenu')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Szukaj warstwy/), { target: { value: 'xyz' } });
    expect(screen.getByText('Brak warstw dla tego filtru.')).toBeTruthy();
  });

  it('turns a single sublayer on and updates the store', () => {
    render(<LayerCatalog />);
    fireEvent.change(screen.getByPlaceholderText(/Szukaj warstwy/), { target: { value: 'gaz' } });
    fireEvent.click(screen.getByLabelText('Uzbrojenie terenu: Gaz'));
    const s = useMapStore.getState();
    expect(s.overlays).toContain('kiut');
    expect(s.sublayers.kiut).toEqual(['przewod_gazowy']);
  });

  it('offers to zoom in for a checked sublayer outside its scale, without toggling it', () => {
    render(<LayerCatalog />);
    fireEvent.click(screen.getByRole('button', { name: 'Warstwy usługi: Ewidencja gruntów i budynków' }));
    // A sublayer the server does not draw at this scale is greyed, and says why on hover.
    expect(screen.getByTitle('Widoczne od skali 1:10 000. Teraz niewidoczne.').textContent).toBe('Działki');
    const zoom = screen.getByTitle('Widoczne od skali 1:10 000');
    // Outside the checkbox label: a click next to the button cannot switch the layer off.
    expect(zoom.closest('label')).toBeNull();
    fireEvent.click(zoom);
    const s = useMapStore.getState();
    expect(s.focus).toMatchObject({ scale: 9000 });
    expect(s.sublayers).toEqual({});
    expect((screen.getByLabelText('Ewidencja gruntów i budynków: Działki') as HTMLInputElement).checked).toBe(true);
  });

  it('explains why one of our services is blocked', () => {
    render(<LayerCatalog />);
    expect((screen.getByLabelText('Uzbrojenie terenu') as HTMLInputElement).disabled).toBe(true);
    const item = screen.getByLabelText('Uzbrojenie terenu').closest('.rounded-xl') as HTMLElement;
    // A problem shows as a shape with a name, not as a coloured dot alone.
    expect(within(item).getByRole('img', { name: 'Niedostępna u nas' })).toBeTruthy();
    // A service that works or has not been loaded yet has a plain dot, which says no problem.
    const normal = screen.getByLabelText('Ewidencja gruntów i budynków').closest('.rounded-xl') as HTMLElement;
    expect(within(normal).queryByRole('img')).toBeNull();
    expect(normal.querySelector('.rounded-full.h-2')).toBeTruthy();
    fireEvent.click(within(item).getByRole('button', { name: 'Niedostępna u nas. Dlaczego?' }));
    expect(within(item).getByText(/Odpowiedź serwera: HTTP 403/)).toBeTruthy();
  });

  it('marks a layer whose data is long in coming, and says why on request', () => {
    useStatusStore.setState({ slow: ['kieg'] });
    render(<LayerCatalog />);
    const item = screen.getByLabelText('Ewidencja gruntów i budynków').closest('.rounded-xl') as HTMLElement;
    expect(within(item).getByRole('img', { name: 'Wczytuje się długo' })).toBeTruthy();
    fireEvent.click(within(item).getByRole('button', { name: 'Dlaczego to trwa?' }));
    expect(within(item).getByText(/Serwer tej usługi odpowiada wolno/)).toBeTruthy();
    act(() => useStatusStore.setState({ slow: [] }));
    expect(within(item).queryByRole('img')).toBeNull();
  });
});
