import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BasemapSwitcher } from './BasemapSwitcher';
import { useMapStore } from '@/state/store';
import { ROW } from './BaseWheel';

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

describe('the wheel of base maps', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const thumb = () => screen.getByRole('button', { name: /^Przełącz podkład na/ });
  const hold = (ms = 500) => {
    fireEvent.pointerDown(thumb(), { button: 0, clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(ms));
    fireEvent.pointerUp(thumb());
    fireEvent.click(thumb());
  };
  const wheel = () => screen.queryByRole('listbox', { name: 'Podkłady' });
  /** Turns the wheel to a row as a finger would, and lets it come to rest. */
  const turn = (row: number) => {
    const list = wheel()!;
    list.scrollTop = row * ROW;
    fireEvent.scroll(list);
    act(() => vi.advanceTimersByTime(300));
  };

  it('turns up when the thumbnail is pressed and held, and the click that ends the hold switches nothing', () => {
    render(<BasemapSwitcher />);
    hold();
    expect(wheel()).toBeTruthy();
    expect(useMapStore.getState().base).toBe('mapa');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Zdjęcia', 'Mapa', 'Teren', 'Prosta', 'Skany', 'Brak']);
  });

  it('is not a short tap or a finger panning the map', () => {
    render(<BasemapSwitcher />);
    hold(200);
    expect(wheel()).toBeNull();
    expect(useMapStore.getState().base).toBe('orto');
    fireEvent.pointerDown(thumb(), { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(thumb(), { clientX: 40, clientY: 10 });
    act(() => vi.advanceTimersByTime(600));
    expect(wheel()).toBeNull();
  });

  it('shows the map in the middle band as soon as the wheel stops', () => {
    render(<BasemapSwitcher />);
    hold();
    turn(2);
    expect(useMapStore.getState().base).toBe('teren');
    expect(wheel()!.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Teren' }).id);
    turn(0);
    expect(useMapStore.getState().base).toBe('orto');
  });

  it('closes with Escape or a tap outside, keeping the map it stopped on', () => {
    render(<BasemapSwitcher />);
    hold();
    turn(3);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(wheel()).toBeNull();
    expect(useMapStore.getState().base).toBe('prosta');
    hold();
    fireEvent.pointerDown(document.body);
    expect(wheel()).toBeNull();
  });
});
