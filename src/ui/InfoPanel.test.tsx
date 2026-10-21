import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InfoPanel } from './InfoPanel';
import { useInfoStore } from '@/state/info';
import { useMapStore } from '@/state/store';
import { stubFetch } from '@/test/helpers';

const point: [number, number] = [656849, 482462];

beforeEach(() => {
  useInfoStore.setState({ query: null });
  useMapStore.setState({ panel: 'none' });
});

describe('InfoPanel', () => {
  it('says when the aerial photo was taken and links its sheet', async () => {
    stubFetch([
      ['/api/orto', { latest: { date: '2025-04-27', pixel: 0.05, color: 'RGB', sheet: 'N-34-138-B-d-2-4', download: 'https://opendata.geoportal.gov.pl/o/a.tif', sizeMb: 1026 }, archived: 23 }],
    ]);
    useInfoStore.getState().start(point, []);
    render(<InfoPanel />);
    expect(await screen.findByText('27.04.2025')).toBeTruthy();
    expect(screen.getByText('5 cm')).toBeTruthy();
    expect((screen.getByRole('link', { name: /pobierz arkusz N-34-138-B-d-2-4/ }) as HTMLAnchorElement).href).toBe('https://opendata.geoportal.gov.pl/o/a.tif');
  });


  it('renders nothing without a query', () => {
    render(<InfoPanel />);
    expect(screen.queryByText('Informacje o miejscu')).toBeNull();
  });

  it('shows coordinates in both systems and a loading state per service', () => {
    useInfoStore.getState().start(point, ['kieg']);
    render(<InfoPanel />);
    expect(screen.getByText(/^PL-1992 X 482\s462, Y 656\s849 · 52,18\d+° N, 21,29\d+° E$/)).toBeTruthy();
    expect(screen.getByText('Wczytywanie…')).toBeTruthy();
  });

  it('links to the geoportal parcel report for the clicked point, X = northing', () => {
    useInfoStore.getState().start(point, []);
    render(<InfoPanel />);
    const link = screen.getByRole('link', { name: /Raport o działce/ }) as HTMLAnchorElement;
    expect(link.href).toBe('https://mapy.geoportal.gov.pl/imap/parcelInfo/index3_a.html?x=482462.00&y=656849.00');
    expect(link.target).toBe('_blank');
  });

  it('renders records with links, empty answers and errors', () => {
    const store = useInfoStore.getState();
    store.start(point, ['kieg', 'kimpzp', 'rcn']);
    store.resolve(point, 'kieg', { status: 'done', records: [{ title: 'Działka', fields: [{ label: 'Numer', value: '22/1' }, { label: 'Raport', value: 'Pobierz', href: 'https://x/r' }] }] });
    store.resolve(point, 'kimpzp', { status: 'done', records: [] });
    store.resolve(point, 'rcn', { status: 'error', error: 'HTTP 502' });
    render(<InfoPanel />);
    expect(screen.getByText('22/1')).toBeTruthy();
    expect((screen.getByRole('link', { name: /Pobierz/ }) as HTMLAnchorElement).href).toBe('https://x/r');
    expect(screen.getByText('Brak danych w tym miejscu.')).toBeTruthy();
    expect(screen.getByText(/Nie udało się pobrać danych/)).toBeTruthy();
  });

  it('ignores answers for an earlier click', () => {
    const store = useInfoStore.getState();
    store.start(point, ['kieg']);
    store.start([1, 1], ['kieg']);
    store.resolve(point, 'kieg', { status: 'done', records: [{ fields: [{ label: 'Stare', value: 'x' }] }] });
    render(<InfoPanel />);
    expect(screen.queryByText('Stare')).toBeNull();
  });

  it('points to the catalog when no queryable layer is on, and closes', () => {
    useInfoStore.getState().start(point, []);
    render(<InfoPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Otwórz warstwy' }));
    expect(useMapStore.getState().panel).toBe('catalog');
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    expect(useInfoStore.getState().query).toBeNull();
  });
});
