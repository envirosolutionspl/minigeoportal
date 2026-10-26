import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { config } from '@/config/runtime';
import { DisplayMenu, useDisplay } from './DisplayMenu';

beforeEach(() => {
  localStorage.clear();
  useDisplay.getState().set({ textSize: 0, contrast: false });
});

describe('DisplayMenu', () => {
  it('enlarges text in two steps and switches high contrast, remembering the choice', () => {
    render(<DisplayMenu />);
    const toggle = screen.getByRole('button', { name: /Ułatwienia/ });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Tekst największy' }));
    expect(document.documentElement.style.fontSize).toBe('125%');
    expect(screen.getByRole('button', { name: 'Tekst największy' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /Wysoki kontrast/ }));
    expect(document.documentElement.dataset.contrast).toBe('high');
    expect(JSON.parse(localStorage.getItem(`${config.app.storagePrefix}display.v1`)!)).toEqual({ textSize: 2, contrast: true });

    fireEvent.click(screen.getByRole('button', { name: /Wysoki kontrast/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tekst standardowy' }));
    expect(document.documentElement.dataset.contrast).toBeUndefined();
    expect(document.documentElement.style.fontSize).toBe('100%');
  });

  // Its WCAG rules: a11y.test.tsx, with the menu open in the top bar.
  it('closes with Escape', () => {
    render(<DisplayMenu />);
    fireEvent.click(screen.getByRole('button', { name: /Ułatwienia/ }));
    expect(screen.getByRole('group', { name: 'Ułatwienia' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Ułatwienia' })).toBeNull();
  });
});
