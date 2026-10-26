import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MapMenu } from './MapMenu';
import { useMapMenu } from '@/state/mapMenu';

/** Warsaw, Palace of Culture, in PL-1992 [easting, northing]. */
const PLACE: [number, number] = [637000, 486980];

const open = (byKeyboard = false) => act(() => useMapMenu.getState().open({ pixel: [100, 100], coordinate: PLACE, byKeyboard }));

let writeText: ReturnType<typeof vi.fn>;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => act(() => useMapMenu.getState().close()));

describe('MapMenu', () => {
  it('shows nothing until the map opens it', () => {
    render(<MapMenu />);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers the three actions, the first one focused', () => {
    render(<MapMenu />);
    open();
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'Kopiuj współrzędne (PL-1992)',
      'Kopiuj współrzędne (WGS 84)',
      'Prowadź do tego miejsca w Google Maps (otwiera się w nowej karcie)',
    ]);
    expect(document.activeElement).toBe(items[0]);
  });

  it('copies PL-1992 as X, Y and WGS 84 as latitude, longitude, and says what it copied', async () => {
    render(<MapMenu />);
    open();
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Kopiuj współrzędne (PL-1992)' })));
    expect(writeText).toHaveBeenLastCalledWith('486980.00, 637000.00');
    expect(screen.getByText('Skopiowano: 486980.00, 637000.00')).toBeTruthy();
    expect(screen.queryByRole('menu')).toBeNull();

    open();
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Kopiuj współrzędne (WGS 84)' })));
    expect(writeText.mock.lastCall?.[0]).toMatch(/^52\.\d{6}, 21\.\d{6}$/);
  });

  it('lets the confirmation of a copy go by itself after 2 seconds', async () => {
    vi.useFakeTimers();
    try {
      render(<MapMenu />);
      open();
      await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Kopiuj współrzędne (WGS 84)' })));
      expect(screen.getByText(/^Skopiowano: 52\./)).toBeTruthy();
      // A finger that tapped the menu where the message comes up does not keep it.
      fireEvent.pointerEnter(screen.getByRole('status', { hidden: true }), { pointerType: 'touch' });
      act(() => vi.advanceTimersByTime(1999));
      expect(screen.queryByText(/^Skopiowano/)).toBeTruthy();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByText(/^Skopiowano/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the confirmation while the mouse points at it', async () => {
    vi.useFakeTimers();
    try {
      render(<MapMenu />);
      open();
      await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Kopiuj współrzędne (WGS 84)' })));
      const toast = screen.getByText(/^Skopiowano/).closest('[role=status]')!;
      fireEvent.pointerEnter(toast, { pointerType: 'mouse' });
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.queryByText(/^Skopiowano/)).toBeTruthy();
      fireEvent.pointerLeave(toast, { pointerType: 'mouse' });
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.queryByText(/^Skopiowano/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the text to copy by hand when the clipboard is not allowed', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<MapMenu />);
    open();
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Kopiuj współrzędne (PL-1992)' })));
    expect(screen.getByText('486980.00, 637000.00')).toBeTruthy();
  });

  it('leads to the place in Google Maps, in a new tab or its app', () => {
    render(<MapMenu />);
    open();
    const link = screen.getByRole('menuitem', { name: /Google Maps/ }) as HTMLAnchorElement;
    expect(link.href).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=52\.\d{6}%2C21\.\d{6}$/);
    expect(link.target).toBe('_blank');
  });

  it('moves with the arrow keys and closes with Escape, giving the focus back to the map it was opened from', () => {
    const map = document.createElement('div');
    map.id = 'map';
    map.tabIndex = 0;
    document.body.append(map);
    render(<MapMenu />);
    open(true);
    const items = screen.getAllByRole('menuitem');
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: 'ArrowUp' });
    fireEvent.keyDown(items[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2], { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(map);
    map.remove();
  });

  it('closes on a press outside the menu and the map', () => {
    render(<MapMenu />);
    open();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
