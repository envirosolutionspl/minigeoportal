import { useEffect, useRef, type MouseEvent } from 'react';

/**
 * A modal <dialog> driven by an open flag: shown with showModal() and closed with the flag, and
 * closed by a click on its backdrop (the dialog element itself, outside its content). Escape
 * closes a modal dialog natively, so the backdrop needs no key handler of its own.
 */
export function useModalDialog(open: boolean, onClose: () => void, onOpen?: () => void) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      onOpen?.();
      d.showModal();
    }
    if (!open && d.open) d.close();
    // onOpen runs with the opening only, not when its identity changes between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) onClose();
  };

  return { ref, onBackdropClick };
}
