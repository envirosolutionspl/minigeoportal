import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { LayerCatalog } from './LayerCatalog';
import { useMapStore } from '@/state/store';
import { useStatusStore } from '@/services/status';
import { stubFetch, withCapabilities } from '@/test/helpers';
import { clearCatalog } from '@/services/catalog';

beforeEach(async () => {
  useMapStore.setState({ overlays: ['kieg'], sublayers: {}, opacity: {}, panel: 'catalog', scale: 47247 });
  useStatusStore.setState({ status: {} });
  clearCatalog();
  await withCapabilities();
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
    { id: 'msKIEG', title: 'Ewidencja gruntów i budynków', path: [], topic: 'dzialki', kind: 'wms', order: 0, status: 'ok', checked: '2026-10-22T08:00:00Z', curated: 'kieg' },
    { id: 'msZabytki', title: 'Rejestr zabytków nieruchomych', path: ['Dane innych instytucji', 'Narodowy Instytut Dziedzictwa'], topic: 'zabytki', kind: 'wms', order: 5, status: 'ok', checked: '2026-10-22T08:00:00Z' },
    { id: 'msCLC', title: 'Corine Land Cover 2018', path: ['GIOŚ'], topic: 'srodowisko', kind: 'wms', order: 6, status: 'refused', detail: 'HTTP 403', checked: '2026-10-22T08:00:00Z' },
    { id: 'msEGM', title: 'EuroGlobalMap', path: [], topic: 'teren', kind: 'rest', order: 7, status: 'unsupported', checked: '2026-10-22T08:00:00Z' },
  ],
};

describe('LayerCatalog', () => {
  it('lists starters first, then every geoportal layer by topic, without repeating our own', async () => {
    stubFetch([['/api/catalog', CATALOG]]);
    render(<LayerCatalog />);
    expect(screen.getByText('Na start')).toBeTruthy();
    expect(screen.getByLabelText('Plany ogólne gmin (POG)')).toBeTruthy();
    fireEvent.click(await section(/Zabytki i turystyka/));
    expect(screen.getByLabelText('Rejestr zabytków nieruchomych')).toBeTruthy();
    expect(screen.getByText('Dane innych instytucji › Narodowy Instytut Dziedzictwa')).toBeTruthy();
    // Our own entry stands for msKIEG, so it is listed once.
    expect(screen.getAllByLabelText('Ewidencja gruntów i budynków')).toHaveLength(1);
  });

  it('keeps unavailable layers in their topic, greyed out, with the reason on request', async () => {
    stubFetch([['/api/catalog', CATALOG]]);
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
    stubFetch([['/api/catalog', CATALOG]]);
    render(<LayerCatalog />);
    await section(/Zabytki i turystyka/);
    fireEvent.change(screen.getByPlaceholderText(/Szukaj warstwy/), { target: { value: 'dziedzictwa' } });
    fireEvent.click(screen.getByLabelText('Rejestr zabytków nieruchomych'));
    expect(useMapStore.getState().overlays).toContain('msZabytki');
    expect(screen.getByText('Wczytuję warstwę…')).toBeTruthy();
  });

  it('says when the full list is still being prepared', async () => {
    stubFetch([['/api/catalog', 'w przygotowaniu', { status: 503 }]]);
    render(<LayerCatalog />);
    expect(await screen.findByText(/jest w przygotowaniu/)).toBeTruthy();
    expect(screen.getByLabelText('Plany ogólne gmin (POG)')).toBeTruthy();
  });

  it('finds a sublayer by text, ignoring diacritics, and highlights it', () => {
    render(<LayerCatalog />);
    fireEvent.change(screen.getByPlaceholderText(/Szukaj warstwy/), { target: { value: 'kanalizacja' } });
    expect(screen.getByLabelText('Uzbrojenie terenu: Kanalizacja')).toBeTruthy();
    expect(screen.queryByLabelText('Ewidencja gruntów i budynków')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Szukaj warstwy/), { target: { value: 'dzialki' } });
    expect(screen.getByLabelText('Ewidencja gruntów i budynków')).toBeTruthy();
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
    const zoom = screen.getByTitle('Widoczne od skali 1:10000');
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
    fireEvent.click(within(item).getByRole('button', { name: 'Niedostępna u nas. Dlaczego?' }));
    expect(within(item).getByText(/Odpowiedź serwera: HTTP 403/)).toBeTruthy();
  });
});
