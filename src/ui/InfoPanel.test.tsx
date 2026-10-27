import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { InfoPanel } from './InfoPanel';
import { useInfoStore } from '@/state/info';
import { useMapStore } from '@/state/store';
import { stubFetch, withCapabilities } from '@/test/helpers';

const point: [number, number] = [656849, 482462];

beforeEach(() => {
  useInfoStore.setState({ query: null });
  useMapStore.setState({ panel: 'none' });
});

describe('InfoPanel', () => {
  it('says when the aerial photo was taken and links its sheet, on the photo base map only', async () => {
    useMapStore.setState({ base: 'orto' });
    const { calls } = stubFetch([
      [
        '/api/orto',
        {
          latest: {
            date: '2025-04-27',
            pixel: 0.05,
            color: 'RGB',
            sheet: 'N-34-138-B-d-2-4',
            download: 'https://opendata.geoportal.gov.pl/o/a.tif',
            sizeMb: 1026,
          },
          archived: 23,
          history: [
            { date: '2001-05-13', pixel: 0.75 },
            { date: '2011-04-21', pixel: 0.25 },
            { date: '2025-04-27', pixel: 0.05 },
          ],
        },
      ],
    ]);
    useInfoStore.getState().start(point, []);
    render(<InfoPanel />);
    expect(await screen.findByText('27.04.2025')).toBeTruthy();
    expect(screen.getByText('5 cm')).toBeTruthy();
    expect((screen.getByRole('link', { name: /pobierz arkusz N-34-138-B-d-2-4/ }) as HTMLAnchorElement).href).toBe(
      'https://opendata.geoportal.gov.pl/o/a.tif',
    );

    // On a drawn map the line goes and the backend is not asked again.
    const photoCalls = () => calls.filter((u) => u.includes('/api/orto')).length;
    const asked = photoCalls();
    act(() => useMapStore.setState({ base: 'mapa' }));
    expect(screen.queryByText('27.04.2025')).toBeNull();
    act(() => useInfoStore.getState().start([656849, 482000], []));
    expect(photoCalls()).toBe(asked);
  });

  it('says the height of the terrain at the point, northing first to the elevation model, and nothing where it has none', async () => {
    useMapStore.setState({ base: 'mapa' });
    const { calls } = stubFetch([['services.gugik.gov.pl/nmt', '113.1']]);
    useInfoStore.getState().start(point, []);
    render(<InfoPanel />);
    expect(await screen.findByText('Wysokość terenu: 113,1 m n.p.m.')).toBeTruthy();
    const asked = calls.find((u) => u.includes('GetHByXY'))!;
    expect(asked).toContain(`x=${point[1].toFixed(2)}&y=${point[0].toFixed(2)}`);
    stubFetch([['services.gugik.gov.pl/nmt', '0']]);
    act(() => useInfoStore.getState().start([656849, 482000], []));
    await act(async () => {});
    expect(screen.queryByText(/Wysokość terenu/)).toBeNull();
  });

  it('counts the archived photos and leads into the time view at the place; in the view it names the photo as of the date', async () => {
    useMapStore.setState({ base: 'orto', tool: 'none', zoom: 8 });
    stubFetch([
      [
        '/api/orto',
        {
          latest: { date: '2025-04-27', pixel: 0.05, color: 'RGB', sheet: 'N' },
          archived: 5,
          history: [
            { date: '2001-05-13', pixel: 0.75 },
            { date: '2025-04-27', pixel: 0.05 },
          ],
        },
      ],
    ]);
    useInfoStore.getState().start(point, []);
    render(<InfoPanel />);
    expect(await screen.findByText(/2 zdjęcia od 2001/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zobacz zmiany' }));
    const s = useMapStore.getState();
    expect(s.tool).toBe('time');
    expect(s.focus).toMatchObject({ center: point, zoom: 10 });
    expect(useInfoStore.getState().query).toBeNull();

    act(() => useMapStore.setState({ time: '2015-01-01' }));
    act(() => useInfoStore.getState().start(point, []));
    expect(await screen.findByText('13.05.2001')).toBeTruthy();
    expect(screen.getByText(/Stan na 01.01.2015/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Zobacz zmiany' })).toBeNull();
    useMapStore.setState({ tool: 'none' });
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

  it('links to the geoportal parcel report for the clicked point, X = northing', async () => {
    useInfoStore.getState().start(point, []);
    render(<InfoPanel />);
    const link = (await screen.findByRole('link', { name: /Raport o działce/ })) as HTMLAnchorElement;
    expect(link.href).toBe('https://mapy.geoportal.gov.pl/imap/parcelInfo/index3_a.html?x=482462.00&y=656849.00');
    expect(link.target).toBe('_blank');
  });

  it('renders records with links, empty answers and errors', () => {
    const store = useInfoStore.getState();
    store.start(point, ['kieg', 'kimpzp', 'rcn']);
    store.resolve(point, 'kieg', {
      status: 'done',
      records: [
        {
          title: 'Działka',
          fields: [
            { label: 'Numer', value: '22/1' },
            { label: 'Raport', value: 'Pobierz', href: 'https://x/r' },
          ],
        },
      ],
    });
    store.resolve(point, 'kimpzp', { status: 'done', records: [] });
    store.resolve(point, 'rcn', { status: 'error' });
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

  it('says from which scale a layer that is on answers, and goes there', async () => {
    await withCapabilities();
    // Precincts answer up to 1:25 000, parcels up to 1:10 000: the precincts are the smaller step.
    useMapStore.setState({ overlays: ['kieg'], sublayers: {}, scale: 47247, focus: null });
    useInfoStore.getState().start(point, []);
    render(<InfoPanel />);
    expect(screen.getByText(/Ewidencja gruntów i budynków podaje informacje o miejscu od skali 1:25\s000/)).toBeTruthy();
    expect(screen.queryByText(/Włącz warstwę/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Przybliż mapę' }));
    expect(useMapStore.getState().focus?.scale).toBeCloseTo(22500);
  });

  it('points to the catalog when no queryable layer is on, and closes', () => {
    useMapStore.setState({ overlays: [] });
    useInfoStore.getState().start(point, []);
    render(<InfoPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Otwórz warstwy' }));
    expect(useMapStore.getState().panel).toBe('catalog');
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    expect(useInfoStore.getState().query).toBeNull();
  });
});
