import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MeasureBar } from './MeasureBar';
import { useMapStore } from '@/state/store';

beforeEach(() => useMapStore.setState({ tool: 'none', measureResult: '' }));

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

  it('tells how to measure with clicks, and with the keys only where there is one', () => {
    useMapStore.setState({ tool: 'measure-line' });
    render(<MeasureBar />);
    const hint = screen.getByText(/Klikaj kolejne punkty/);
    expect(hint.textContent).toBe(
      'Klikaj kolejne punkty na mapie, dwuklik kończy pomiar. Z klawiatury Enter dodaje punkt w środku mapy, drugi Enter w tym miejscu kończy. Esc anuluje rysowany kształt.',
    );
    expect(screen.getByText(/Z klawiatury Enter/).className).toContain('phone:hidden');
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
