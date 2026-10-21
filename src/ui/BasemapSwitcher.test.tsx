import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BasemapSwitcher } from './BasemapSwitcher';
import { useMapStore } from '@/state/store';

beforeEach(() => useMapStore.setState({ base: 'mapa' }));

describe('BasemapSwitcher', () => {
  it('shows the base map in use and opens the list on click', () => {
    render(<BasemapSwitcher />);
    const toggle = screen.getByRole('button', { name: 'Podkład: Mapa. Zmień podkład' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Podkład: Mapa', pressed: true })).toBeTruthy();
  });

  it('switches the base map, then shows it and closes the list', () => {
    render(<BasemapSwitcher />);
    fireEvent.click(screen.getByRole('button', { name: /Zmień podkład/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Podkład: Zdjęcia' }));
    expect(useMapStore.getState().base).toBe('orto');
    const toggle = screen.getByRole('button', { name: 'Podkład: Zdjęcia. Zmień podkład' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the list with Escape', () => {
    render(<BasemapSwitcher />);
    const toggle = screen.getByRole('button', { name: /Zmień podkład/ });
    fireEvent.click(toggle);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });
});
