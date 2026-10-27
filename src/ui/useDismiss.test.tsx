import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useDismiss } from './useDismiss';

function Menu({ active = true, escape, onClose }: { active?: boolean; escape?: boolean; onClose: (e: Event) => void }) {
  const root = useRef<HTMLDivElement>(null);
  useDismiss(active, root, onClose, escape === undefined ? {} : { escape });
  return (
    <div ref={root}>
      <button type="button">inside</button>
    </div>
  );
}

describe('useDismiss', () => {
  it('closes on a press outside, not on one inside', () => {
    const onClose = vi.fn();
    render(<Menu onClose={onClose} />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'inside' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose.mock.lastCall![0]).toBeInstanceOf(PointerEvent);
  });

  it('closes on Escape before anything under it hears the key, unless told to leave the key alone', () => {
    const onClose = vi.fn();
    const below = vi.fn();
    document.addEventListener('keydown', below);
    const { rerender } = render(<Menu onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(below).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(below).toHaveBeenCalledOnce();

    rerender(<Menu onClose={onClose} escape={false} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(below).toHaveBeenCalledTimes(2);
    document.removeEventListener('keydown', below);
  });

  it('listens only while active, and stops with the component', () => {
    const onClose = vi.fn();
    const { rerender, unmount } = render(<Menu active={false} onClose={onClose} />);
    fireEvent.pointerDown(document.body);
    expect(onClose).not.toHaveBeenCalled();
    rerender(<Menu active onClose={onClose} />);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
