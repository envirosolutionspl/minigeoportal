import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';

const Window = ({ open, onClose, onOpen }: { open: boolean; onClose: () => void; onOpen?: () => void }) => (
  <Modal open={open} onClose={onClose} onOpen={onOpen} labelledBy="title" className="w-80">
    <h2 id="title">Okno</h2>
    <button type="button">Pierwszy</button>
    <button type="button" data-autofocus>
      Drugi
    </button>
  </Modal>
);

describe('Modal', () => {
  it('shows the window as a modal with the flag, focused where it is marked, and closes it with the flag', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<Window open={false} onClose={() => {}} onOpen={onOpen} />);
    const dialog = screen.getByRole('dialog', { hidden: true }) as HTMLDialogElement;
    expect(dialog.open).toBe(false);

    rerender(<Window open onClose={() => {}} onOpen={onOpen} />);
    expect(dialog.open).toBe(true);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Drugi' }));
    // A render while open is not another opening.
    rerender(<Window open onClose={() => {}} onOpen={onOpen} />);
    expect(onOpen).toHaveBeenCalledOnce();

    rerender(<Window open={false} onClose={() => {}} onOpen={onOpen} />);
    expect(dialog.open).toBe(false);
  });

  it('closes on a click on the backdrop, which is the dialog element itself, not on one inside it', () => {
    const onClose = vi.fn();
    render(<Window open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pierwszy' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog', { name: 'Okno' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
