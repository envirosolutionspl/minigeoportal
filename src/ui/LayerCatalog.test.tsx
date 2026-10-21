import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LayerCatalog } from './LayerCatalog';
import { useMapStore } from '@/state/store';
import { useStatusStore } from '@/services/status';
import { withCapabilities } from '@/test/helpers';

beforeEach(async () => {
  useMapStore.setState({ overlays: ['kieg'], sublayers: {}, opacity: {}, panel: 'catalog', scale: 47247 });
  useStatusStore.setState({ status: {} });
  await withCapabilities();
});

describe('LayerCatalog', () => {
  it('lists starters first and the rest below', () => {
    render(<LayerCatalog />);
    expect(screen.getByText('Na start')).toBeTruthy();
    expect(screen.getByText('Pozostałe')).toBeTruthy();
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

  it('shows the geoportal link for a blocked service', () => {
    render(<LayerCatalog />);
    expect(screen.getByText(/Dostępna tylko na geoportal.gov.pl/)).toBeTruthy();
    expect((screen.getByLabelText('Uzbrojenie terenu') as HTMLInputElement).disabled).toBe(true);
  });
});
