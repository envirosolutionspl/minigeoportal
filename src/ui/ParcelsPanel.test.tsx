import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import WKT from 'ol/format/WKT';
import { ParcelsPanel } from './ParcelsPanel';
import { useParcelStore } from '@/state/parcels';
import { useMapStore } from '@/state/store';
import type { Parcel } from '@/modules';

const parcel = (id: string, number: string): Parcel => ({
  id,
  voivodeship: 'mazowieckie',
  county: 'powiat miński',
  commune: 'Mińsk Mazowiecki (miasto)',
  region: 'Mińsk Mazowiecki',
  number,
  wkt: '',
});
/** Text as read, with the no-break spaces of Polish numbers as plain ones. */
const plain = (el: Element) => el.textContent?.replace(/\s/g, ' ');
const geometry = new WKT().readGeometry('POLYGON((675000 482000,675100 482000,675100 482100,675000 482100,675000 482000))');

beforeEach(() => {
  useMapStore.setState({ tool: 'parcels', parcels: ['141201_1.0001.1', '141201_1.0001.2', '141201_1.0001.3'] });
  useParcelStore.setState({
    message: '',
    entries: {
      '141201_1.0001.1': { status: 'ready', parcel: parcel('141201_1.0001.1', '1'), geometry, area: 10000 },
      '141201_1.0001.2': { status: 'ready', parcel: parcel('141201_1.0001.2', '2'), geometry, area: 2500 },
      '141201_1.0001.3': { status: 'missing' },
    },
  });
});

describe('ParcelsPanel', () => {
  it('is there only while its tool is open', () => {
    useMapStore.setState({ tool: 'none' });
    const { container } = render(<ParcelsPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('lists the parcels in order with their areas, says which ULDK does not know, and sums those it found', () => {
    render(<ParcelsPanel />);
    expect(screen.getAllByText(/^Działek:/).map(plain)).toEqual(['Działek: 3 z 10 · łącznie 1,25 ha (12 500 m²)']);
    const rows = screen.getAllByRole('listitem');
    expect(rows.map(plain)).toEqual([
      expect.stringContaining('dz. 1, obręb Mińsk Mazowiecki · 1 ha (10 000 m²)'),
      expect.stringContaining('dz. 2, obręb Mińsk Mazowiecki · 2500 m²'),
      expect.stringContaining('Nie ma jej w ULDK'),
    ]);
    expect(screen.getByText(/nie odpowiada powierzchni ewidencyjnej/)).toBeTruthy();
  });

  it('removes one parcel, clears them all and closes', () => {
    render(<ParcelsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Usuń działkę 141201_1.0001.2 z selekcji' }));
    expect(useMapStore.getState().parcels).toEqual(['141201_1.0001.1', '141201_1.0001.3']);
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść' }));
    expect(useMapStore.getState().parcels).toEqual([]);
    expect(screen.getByText(/Selekcja jest pusta/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij selekcję działek' }));
    expect(useMapStore.getState().tool).toBe('none');
  });

  it('offers the files only when some parcel is found, and shows them all on the map', () => {
    render(<ParcelsPanel />);
    const files = within(screen.getByRole('group', { name: 'Pobierz selekcję' }));
    expect((files.getByRole('button', { name: 'Pobierz selekcję jako CSV' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż wszystkie' }));
    expect(useMapStore.getState().focus?.extent).toEqual([675000, 482000, 675100, 482100]);
    act(() => useParcelStore.setState({ entries: { '141201_1.0001.3': { status: 'missing' } } }));
    expect((files.getByRole('button', { name: 'Pobierz selekcję jako CSV' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
