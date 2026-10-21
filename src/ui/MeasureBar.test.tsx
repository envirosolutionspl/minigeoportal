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

  it('clears drawings and closes', () => {
    useMapStore.setState({ tool: 'measure-line', measureResult: 'x' });
    render(<MeasureBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Wyczyść' }));
    expect(useMapStore.getState().measureResult).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Zakończ pomiar' }));
    expect(useMapStore.getState().tool).toBe('none');
  });
});
