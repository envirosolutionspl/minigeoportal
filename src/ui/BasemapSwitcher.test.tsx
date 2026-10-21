import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BasemapSwitcher } from './BasemapSwitcher';
import { useMapStore } from '@/state/store';

beforeEach(() => useMapStore.setState({ base: 'mapa' }));

describe('BasemapSwitcher', () => {
  it('shows the base map one click switches to, as in Google Maps, and goes back to the last map', () => {
    render(<BasemapSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'Przełącz podkład na: Zdjęcia' }));
    expect(useMapStore.getState().base).toBe('orto');
    fireEvent.click(screen.getByRole('button', { name: 'Przełącz podkład na: Mapa' }));
    expect(useMapStore.getState().base).toBe('mapa');
  });

  it('returns from photos to the map chosen from the list', () => {
    render(<BasemapSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: 'Wszystkie podkłady' }));
    fireEvent.click(screen.getByRole('button', { name: 'Podkład: Teren' }));
    expect(useMapStore.getState().base).toBe('teren');
    fireEvent.click(screen.getByRole('button', { name: 'Przełącz podkład na: Zdjęcia' }));
    expect(screen.getByRole('button', { name: 'Przełącz podkład na: Teren' })).toBeTruthy();
  });

  it('opens the list with the touch button, marks the active map and closes with Escape', () => {
    render(<BasemapSwitcher />);
    const more = screen.getByRole('button', { name: 'Wszystkie podkłady' });
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Podkład: Mapa', pressed: true })).toBeTruthy();
    // Photos are on the thumbnail, so not on the list.
    expect(screen.queryByRole('button', { name: 'Podkład: Zdjęcia' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });
});
