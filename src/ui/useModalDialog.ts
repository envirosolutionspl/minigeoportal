import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

/**
 * A modal <dialog> driven by an open flag: shown with showModal() and closed with the flag, and
 * closed by a click on its backdrop (the dialog element itself, outside its content): pressed and
 * let go there both, so a drag that starts in a field (selecting its text) and ends outside the
 * window does not close it. Escape
 * closes a modal dialog natively, so the backdrop needs no key handler of its own. The element
 * marked `data-autofocus` takes the focus as the dialog opens: React's autoFocus runs while the
 * dialog is still closed, so the browser would start on the first link instead. A dialog closed
 * with the flag hands the focus back by itself; one taken out of the page while open (its owner
 * stops rendering it) does not, so the focus is put back where it was when the dialog opened.
 */
export function useModalDialog(open: boolean, onClose: () => void, onOpen?: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      onOpen?.();
      opener.current = document.activeElement;
      d.showModal();
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && d.open) d.close();
    // onOpen runs with the opening only, not when its identity changes between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    return () => {
      const back = opener.current;
      // What opened the dialog may be a part of a drawing (a focusable SVG element), not only an HTML one.
      if (d?.open && (back instanceof HTMLElement || back instanceof SVGElement) && back.isConnected) back.focus();
    };
  }, []);

  // A click goes to the closest element under both the press and the release: a drag from a field
  // out of the window arrives as a click on the dialog itself, so where the press was is kept.
  const pressed = useRef(false);
  const onBackdropPointerDown = (e: PointerEvent<HTMLDialogElement>) => {
    pressed.current = e.target === ref.current;
  };
  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    const onBackdrop = pressed.current && e.target === ref.current;
    pressed.current = false;
    if (onBackdrop) onClose();
  };

  return { ref, onBackdropClick, onBackdropPointerDown };
}
