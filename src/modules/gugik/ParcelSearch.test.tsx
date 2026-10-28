import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ParcelSearch } from './ParcelSearch';
import { useMapStore } from '@/state/store';
import { stubFetch } from '@/test/helpers';
import { clearDictionaryCache } from './dictionaries';

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

// A failing test with fake timers must not leave them to the next one.
afterEach(() => vi.useRealTimers());

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

  it('takes only digits and a slash for the number, and searches only a whole parcel number', async () => {
    render(<ParcelSearch onClose={() => {}} />);
    await chooseAll();
    const field = screen.getByPlaceholderText('np. 22/1') as HTMLInputElement;
    const button = screen.getByRole('button', { name: 'Szukaj działki' }) as HTMLButtonElement;
    fireEvent.change(field, { target: { value: 'Yih' } });
    expect(field.value).toBe('');
    fireEvent.change(field, { target: { value: '2a2 / 1-' } });
    expect(field.value).toBe('22/1');
    expect(button.disabled).toBe(false);
    fireEvent.change(field, { target: { value: '22/' } });
    expect(button.disabled).toBe(true);
    expect(field.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(field.getAttribute('aria-describedby')!)?.textContent).toMatch(/cyfry/);
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
    vi.useFakeTimers();
    stubFetch([['/api/dict/wojewodztwa', 'down', { status: 503 }]]);
    render(<ParcelSearch onClose={() => {}} />);
    // A list asks once more 800 ms after a failure (dictionaries.ts). The last chosen units survive
    // closing the panel, so every enabled list fails and offers a retry.
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(screen.getAllByText('Spróbuj ponownie').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Spróbuj ponownie: Województwo' })).toBeTruthy();
  });

  it('closes with a button big enough for a finger', () => {
    render(<ParcelSearch onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Zamknij' }).className).toContain('p-2.5');
  });
});
