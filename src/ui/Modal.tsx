import { useModalDialog } from './useModalDialog';

/**
 * A modal window over the map: the <dialog> element shown with showModal(), closed with Escape
 * (natively), with a click on its backdrop and by its owner through `open`. `className` sets
 * its width; `blur` softens the map behind it; `onOpen` runs as it opens (see useModalDialog).
 */
export function Modal({
  open,
  onClose,
  onOpen,
  labelledBy,
  className,
  blur,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onOpen?: () => void;
  labelledBy: string;
  className: string;
  blur?: boolean;
  children: React.ReactNode;
}) {
  const { ref, onBackdropClick } = useModalDialog(open, onClose, onOpen);
  return (
    // The backdrop is the dialog itself; Escape closes it natively (see useModalDialog).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={onBackdropClick}
      aria-labelledby={labelledBy}
      className={`m-auto rounded-3xl bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl outline-none backdrop:bg-[#253326]/50 ${
        blur ? 'backdrop:backdrop-blur-[2px]' : ''
      } ${className}`}
    >
      {children}
    </dialog>
  );
}
