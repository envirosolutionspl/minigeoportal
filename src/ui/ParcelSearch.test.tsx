import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ParcelSearch } from './ParcelSearch';
import { useMapStore } from '@/state/store';
import { stubFetch } from '@/test/helpers';
import { clearDictionaryCache } from '@/services/dictionaries';

const PARCEL = '1\n141708_2.0021.22/1|Wiązowna|Wiązowna Gminna|22/1|SRID=2180;POLYGON((0 0,1 0,1 1,0 0))\n';

beforeEach(() => {
  clearDictionaryCache();
  useMapStore.setState({ focus: null });
  stubFetch([
    ['/api/dict/wojewodztwa', [{ id: '14', name: 'mazowieckie' }]],
    ['/api/dict/powiaty/14', [{ id: '1417', name: 'otwocki' }]],
    ['/api/dict/gminy/1417', [{ id: '141708_2', name: 'Wiązowna' }]],
    ['/api/dict/obreby/141708_2', [{ id: '141708_2.0021', name: 'Wiązowna Gminna' }]],
    ['id=141708_2.0021.22%2F1', PARCEL],
    ['id=141708_2.0021.999', '-1 brak wyników'],
    ['id=Wi%C4%85zowna+Gminna+999', '-1 brak wyników'],
  ]);
});

async function chooseAll() {
  const select = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await waitFor(() => expect(screen.getByRole('option', { name: 'mazowieckie' })).toBeTruthy());
  select('Województwo', '14');
  await waitFor(() => expect(screen.getByRole('option', { name: 'otwocki' })).toBeTruthy());
  select('Powiat', '1417');
  await waitFor(() => expect(screen.getByRole('option', { name: 'Wiązowna' })).toBeTruthy());
  select('Gmina', '141708_2');
  await waitFor(() => expect(screen.getByRole('option', { name: 'Wiązowna Gminna' })).toBeTruthy());
  select('Obręb', '141708_2.0021');
}

describe('ParcelSearch', () => {
  it('fills the lists one after another and enables the button only with a precinct and a number', async () => {
    render(<ParcelSearch onClose={() => {}} />);
    const button = screen.getByRole('button', { name: 'Szukaj działki' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect((screen.getByLabelText('Powiat') as HTMLSelectElement).disabled).toBe(true);
    await chooseAll();
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('np. 22/1'), { target: { value: '22/1' } });
    expect(button.disabled).toBe(false);
  });

  it('shows the found parcel on the map, persistently, and folds into a summary', async () => {
    const onClose = vi.fn();
    render(<ParcelSearch onClose={onClose} />);
    await chooseAll();
    fireEvent.change(screen.getByPlaceholderText('np. 22/1'), { target: { value: '22/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Szukaj działki' }));
    await waitFor(() => expect(screen.getByText('Działka 22/1')).toBeTruthy());
    expect(useMapStore.getState().focus).toMatchObject({ wkt: 'POLYGON((0 0,1 0,1 1,0 0))', persist: true });
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść i zamknij' }));
    expect(useMapStore.getState().focus).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });

  it('explains when nothing is found', async () => {
    render(<ParcelSearch onClose={() => {}} />);
    await chooseAll();
    fireEvent.change(screen.getByPlaceholderText('np. 22/1'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Szukaj działki' }));
    await waitFor(() => expect(screen.getByText(/Nie znaleziono działki 999/)).toBeTruthy());
  });

  it('offers a retry when a list fails to load', async () => {
    stubFetch([['/api/dict/wojewodztwa', 'down', { status: 503 }]]);
    render(<ParcelSearch onClose={() => {}} />);
    // The last chosen units survive closing the panel, so every enabled list fails and offers a retry.
    await waitFor(() => expect(screen.getAllByText('Ponów').length).toBeGreaterThan(0), { timeout: 3000 });
  });
});
