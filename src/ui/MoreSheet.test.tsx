import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Ruler } from 'lucide-react';
import { MoreSheet } from './MoreSheet';

describe('MoreSheet', () => {
  it('names every tool in words and closes before running one', () => {
    const onClose = vi.fn();
    const measure = vi.fn(() => expect(onClose).toHaveBeenCalled());
    render(<MoreSheet open onClose={onClose} items={[{ label: 'Pomiar', icon: Ruler, active: true, onClick: measure }]} />);
    const button = screen.getByRole('button', { name: 'Pomiar' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(measure).toHaveBeenCalledOnce();
  });

  it('unfolds the display aids in place', () => {
    render(<MoreSheet open onClose={() => {}} items={[]} />);
    const aids = screen.getByRole('button', { name: 'Ułatwienia' });
    expect(screen.queryByRole('button', { name: 'Wysoki kontrast' })).toBeNull();
    fireEvent.click(aids);
    expect(aids.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Wysoki kontrast' })).toBeTruthy();
  });

  it('ends with the author credit, which phones do not show on the map', () => {
    render(<MoreSheet open onClose={() => {}} items={[]} />);
    expect(screen.getByRole('link', { name: /Stworzone przez/ }).getAttribute('target')).toBe('_blank');
  });
});
