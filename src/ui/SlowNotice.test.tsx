import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SlowNotice } from './SlowNotice';
import { overlayDef } from '@/services/catalog';
import { useStatusStore } from '@/services/status';
import { useMapStore } from '@/state/store';

const title = (id: string) => overlayDef(id)!.title;

beforeEach(() => {
  useStatusStore.setState({ slow: [] });
  useMapStore.setState({ overlays: ['kieg'] });
});

describe('SlowNotice', () => {
  it('names the slow layers that are switched on, and goes once they arrive', () => {
    render(<SlowNotice />);
    expect(screen.getByRole('status').textContent).toBe('');
    act(() => useStatusStore.getState().setSlow(['kieg', 'not-on']));
    expect(screen.getByRole('status').textContent).toBe(`Wolno wczytuje się: ${title('kieg')}`);
    act(() => useStatusStore.getState().setSlow([]));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('stays closed until another layer is slow, or a later wait begins', () => {
    useMapStore.setState({ overlays: ['kieg', 'kimpzp'] });
    act(() => useStatusStore.getState().setSlow(['kieg']));
    render(<SlowNotice />);
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    expect(screen.getByRole('status').textContent).toBe('');
    act(() => useStatusStore.getState().setSlow(['kieg', 'kimpzp']));
    expect(screen.getByRole('status').textContent).toBe(`Wolno wczytuje się: ${title('kieg')}, ${title('kimpzp')}`);
    fireEvent.click(screen.getByRole('button', { name: 'Zamknij' }));
    act(() => useStatusStore.getState().setSlow([]));
    act(() => useStatusStore.getState().setSlow(['kieg']));
    expect(screen.getByRole('status').textContent).toBe(`Wolno wczytuje się: ${title('kieg')}`);
  });
});
