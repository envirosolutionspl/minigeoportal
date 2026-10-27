import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MeasureBar } from './MeasureBar';
import { useMapStore } from '@/state/store';
import { stubFetch } from '@/test/helpers';

beforeEach(() => useMapStore.setState({ tool: 'none', measureResult: '', measureLine: null }));

describe('MeasureBar', () => {
  it('is hidden while no tool is active', () => {
    const { container } = render(<MeasureBar />);
    expect(container.innerHTML).toBe('');
  });

  it('switches between length and area and shows the result', () => {
    useMapStore.setState({ tool: 'measure-line', measureResult: '1,23 km' });
    render(<MeasureBar />);
    expect(screen.getByRole('button', { name: 'Odległość' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Wynik: 1,23 km');
    fireEvent.click(screen.getByRole('button', { name: 'Powierzchnia' }));
    expect(useMapStore.getState().tool).toBe('measure-area');
  });

  it('draws the profile of the terrain along the last measured line, and follows the next one', async () => {
    const { calls } = stubFetch([
      ['GetHByPointList', Array.from({ length: 101 }, (_, i) => `0 0 ${(100 + (i <= 50 ? i : 100 - i) * 0.2).toFixed(1)}`).join(',')],
    ]);
    useMapStore.setState({ tool: 'measure-line', measureResult: '1,00 km' });
    render(<MeasureBar />);
    // No line yet, no profile.
    expect(screen.queryByRole('button', { name: 'Profil terenu' })).toBeNull();
    const line: [number, number][] = [
      [600000, 500000],
      [601000, 500000],
    ];
    act(() => useMapStore.getState().setMeasureLine(line));
    fireEvent.click(screen.getByRole('button', { name: 'Profil terenu' }));
    expect(screen.getByText('Pobieram wysokości terenu…')).toBeTruthy();
    expect(
      await screen.findByText('Wysokość od 100,0 m do 110,0 m n.p.m. W górę 10,0 m, w dół 10,0 m. Największe nachylenie 2%.'),
    ).toBeTruthy();
    expect(calls).toHaveLength(1);
    act(() =>
      useMapStore.getState().setMeasureLine([
        [600000, 500000],
        [600000, 500500],
      ]),
    );
    expect(screen.getByText('Pobieram wysokości terenu…')).toBeTruthy();
    await screen.findByText(/Największe nachylenie/);
    expect(calls).toHaveLength(2);
    // Clearing the drawings takes the profile away.
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść' }));
    expect(screen.queryByRole('button', { name: 'Profil terenu' })).toBeNull();
    expect(screen.queryByText(/Największe nachylenie/)).toBeNull();
  });

  it('says when the heights cannot be had', async () => {
    stubFetch([['GetHByPointList', 'down', { status: 503 }]]);
    useMapStore.setState({
      tool: 'measure-line',
      measureLine: [
        [600000, 500000],
        [600100, 500000],
      ],
    });
    render(<MeasureBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Profil terenu' }));
    expect(await screen.findByText('Nie udało się pobrać wysokości terenu.')).toBeTruthy();
  });

  it('clears drawings and closes', () => {
    useMapStore.setState({ tool: 'measure-line', measureResult: 'x' });
    render(<MeasureBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść' }));
    expect(useMapStore.getState().measureResult).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Zakończ pomiar' }));
    expect(useMapStore.getState().tool).toBe('none');
  });
});
