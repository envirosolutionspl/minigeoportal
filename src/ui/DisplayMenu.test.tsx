import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
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

  it('closes with Escape and has no WCAG rule violations', async () => {
    const { container } = render(<DisplayMenu />);
    fireEvent.click(screen.getByRole('button', { name: /Ułatwienia/ }));
    const result = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations.map((v) => v.id)).toEqual([]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Ułatwienia' })).toBeNull();
  });
});
