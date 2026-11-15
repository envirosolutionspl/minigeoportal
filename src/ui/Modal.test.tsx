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

  it('hands the focus back when its owner stops rendering it while it is open', () => {
    const Owner = ({ shown }: { shown: boolean }) => (
      <>
        <button type="button">Otwórz</button>
        {shown && <Window open onClose={() => {}} />}
      </>
    );
    const { rerender } = render(<Owner shown={false} />);
    screen.getByRole('button', { name: 'Otwórz' }).focus();
    rerender(<Owner shown />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Drugi' }));
    rerender(<Owner shown={false} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Otwórz' }));
  });

  it('hands the focus back to a part of a drawing it was opened from', () => {
    const Owner = ({ shown }: { shown: boolean }) => (
      <>
        <svg>
          <g role="button" tabIndex={0} aria-label="Wierzchołek" />
        </svg>
        {shown && <Window open onClose={() => {}} />}
      </>
    );
    const { rerender } = render(<Owner shown={false} />);
    screen.getByRole('button', { name: 'Wierzchołek' }).focus();
    rerender(<Owner shown />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Drugi' }));
    rerender(<Owner shown={false} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Wierzchołek' }));
  });

  it('closes on a click on the backdrop, which is the dialog element itself, not on one inside it', () => {
    const onClose = vi.fn();
    render(<Window open onClose={onClose} />);
    const first = screen.getByRole('button', { name: 'Pierwszy' });
    fireEvent.pointerDown(first);
    fireEvent.click(first);
    expect(onClose).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: 'Okno' });
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stays open after a drag that starts inside it and ends on the backdrop (selecting the text of a field)', () => {
    const onClose = vi.fn();
    render(<Window open onClose={onClose} />);
    // The browser sends the click of such a drag to the closest element under both ends: the dialog itself.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Pierwszy' }));
    fireEvent.click(screen.getByRole('dialog', { name: 'Okno' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
