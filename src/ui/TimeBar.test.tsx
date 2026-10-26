import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { TimeBar } from './TimeBar';
import { useMapStore } from '@/state/store';
import { registerMeta } from '@/services/meta';
import { stubFetch } from '@/test/helpers';

/** The archival orthophoto map draws below 1:47 247, with monthly values from 1995 to 2025. */
beforeEach(() => {
  vi.useFakeTimers();
  registerMeta('orto-archiwalna', {
    kind: 'wms',
    fetchedAt: '',
    title: '',
    infoFormats: [],
    layers: {
      Raster: {
        title: 'Raster',
        queryable: false,
        maxScale: 47247,
        dimensions: { time: { values: '1995-01-01/2025-11-01/P1M' } },
      },
    },
  });
  useMapStore.setState({ tool: 'time', time: null, timeStatus: 'idle', compare: false, scale: 10000, center: [636500, 486500] });
});

afterEach(() => vi.useRealTimers());

/** The photo index at the centre: three dates. */
const index = () =>
  stubFetch([
    [
      '/api/orto',
      {
        archived: 5,
        history: [
          { date: '2001-05-13', pixel: 0.75 },
          { date: '2011-04-21', pixel: 0.25 },
          { date: '2025-04-27', pixel: 0.05 },
        ],
      },
    ],
  ]);

const slider = () => screen.getByRole('slider', { name: 'Data' }) as HTMLInputElement;
const settle = () => act(async () => vi.advanceTimersByTime(800));

describe('TimeBar', () => {
  it('is hidden outside the time view', () => {
    useMapStore.setState({ tool: 'none' });
    const { container } = render(<TimeBar />);
    expect(container.innerHTML).toBe('');
  });

  it('offers the dates the photo index knows at the centre, newest first shown, and says what is shown', async () => {
    const { calls } = index();
    render(<TimeBar />);
    expect(screen.getByRole('status').textContent).toContain('Sprawdzam');
    await settle();
    expect(calls.some((u) => u.includes('/api/orto?x=636500&y=486500'))).toBe(true);
    expect(slider().max).toBe('2');
    expect(slider().value).toBe('2');
    expect(slider().getAttribute('aria-valuetext')).toBe('27.04.2025');
    expect(useMapStore.getState().time).toBe('2025-04-27');
    expect(screen.getByRole('status').textContent).toBe('Stan na 27.04.2025, piksel 5 cm');
    expect(screen.getByText('2025', { selector: 'span[aria-hidden]' })).toBeTruthy();
  });

  it('steps to the earlier and later date with the buttons and the slider, stopping at the ends', async () => {
    index();
    render(<TimeBar />);
    await settle();
    const earlier = screen.getByRole('button', { name: 'Wcześniejsza data' });
    const later = screen.getByRole('button', { name: 'Późniejsza data' });
    expect((later as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(earlier);
    expect(useMapStore.getState().time).toBe('2011-04-21');
    fireEvent.click(earlier);
    expect(useMapStore.getState().time).toBe('2001-05-13');
    expect((earlier as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(slider(), { target: { value: '1' } });
    expect(useMapStore.getState().time).toBe('2011-04-21');
    expect(screen.getByRole('status').textContent).toBe('Stan na 21.04.2011, piksel 25 cm');
  });

  it('asks for a date only once the slider is let go, showing where it is meanwhile', async () => {
    index();
    render(<TimeBar />);
    await settle();
    // Dragging: the browser sends input events for every date the thumb passes.
    fireEvent.input(slider(), { target: { value: '0' } });
    expect(useMapStore.getState().time).toBe('2025-04-27');
    expect(slider().value).toBe('0');
    expect(slider().getAttribute('aria-valuetext')).toBe('13.05.2001');
    expect(screen.getByRole('status').textContent).toBe('Puść, aby pokazać stan na 13.05.2001.');
    expect(screen.getByText('2001', { selector: 'span[aria-hidden]' })).toBeTruthy();
    // Let go: one change event, which the element itself listens for.
    act(() => {
      slider().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(useMapStore.getState().time).toBe('2001-05-13');
    expect(screen.getByRole('status').textContent).toBe('Stan na 13.05.2001, piksel 75 cm');
  });

  it('snaps a date from a link to the photo the service shows for it', async () => {
    useMapStore.setState({ time: '2015-06-01' });
    index();
    render(<TimeBar />);
    await settle();
    expect(useMapStore.getState().time).toBe('2011-04-21');
    expect(slider().value).toBe('1');
  });

  it('says to zoom in while the map is too far out for the layer, and zooms', async () => {
    index();
    useMapStore.setState({ scale: 100000 });
    render(<TimeBar />);
    await settle();
    expect(screen.getByRole('status').textContent).toContain('Przybliż mapę, aby zobaczyć warstwę Ortofotomapa archiwalna');
    fireEvent.click(screen.getByRole('button', { name: 'Przybliż mapę' }));
    expect(useMapStore.getState().focus?.scale).toBe(20000);
  });

  it('says what is loading, and offers to try again after an error', async () => {
    index();
    render(<TimeBar />);
    await settle();
    act(() => useMapStore.setState({ timeStatus: 'loading' }));
    expect(screen.getByRole('status').textContent).toContain('Wczytuję stan na 27.04.2025');
    act(() => useMapStore.setState({ timeStatus: 'error' }));
    expect(screen.getByRole('status').textContent).toContain('Serwer nie odpowiedział');
    const retries = useMapStore.getState().timeRetries;
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(useMapStore.getState().timeRetries).toBe(retries + 1);
  });

  it('falls back to one value a year when the index has no answer, and says when a place has none', async () => {
    stubFetch([['/api/orto', 'down', { status: 503 }]]);
    render(<TimeBar />);
    await settle();
    expect(slider().max).toBe('30');
    expect(slider().getAttribute('aria-valuetext')).toBe('01.01.2025');

    stubFetch([['/api/orto', { archived: 0, history: [] }]]);
    act(() => useMapStore.setState({ center: [100000, 100000] }));
    await settle();
    expect(screen.getByRole('status').textContent).toBe('Brak danych w tym miejscu.');
    expect(slider().disabled).toBe(true);
  });

  it('asks the index again only once the map has moved to another place', async () => {
    const { calls } = index();
    render(<TimeBar />);
    await settle();
    const asked = calls.length;
    act(() => useMapStore.setState({ center: [636530, 486520] }));
    await settle();
    expect(calls.length).toBe(asked);
    act(() => useMapStore.setState({ center: [640000, 486500] }));
    await settle();
    expect(calls.length).toBe(asked + 1);
  });

  it('switches the comparison with the present on and off, and says how to move the curtain', async () => {
    index();
    render(<TimeBar />);
    await settle();
    const compare = screen.getByRole('button', { name: 'Porównaj z aktualnymi danymi' });
    expect(compare.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(compare);
    expect(useMapStore.getState().compare).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('Przeciągnij kurtynę');
    fireEvent.click(compare);
    expect(useMapStore.getState().compare).toBe(false);
  });

  it('closes with its button', async () => {
    index();
    render(<TimeBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Zakończ podróż w czasie' }));
    expect(useMapStore.getState().tool).toBe('none');
  });
});
