import { useId, useState } from 'react';
import { Accessibility, ChevronDown, X, type LucideIcon } from 'lucide-react';
import { t } from '@/i18n';
import { AUTHOR_URL, AuthorLogo } from './Brand';
import { DisplayOptions } from './DisplayMenu';
import { useModalDialog } from './useModalDialog';

export interface MoreItem {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
}

/**
 * The tools phones keep out of the map, as in Google Maps or swisstopo: a sheet from the bottom
 * with every tool named in words, the display aids folded in, and the author's credit at its foot.
 */
export function MoreSheet({ open, onClose, items }: { open: boolean; onClose: () => void; items: MoreItem[] }) {
  const { ref, onBackdropClick } = useModalDialog(open, onClose);
  const [display, setDisplay] = useState(false);
  const titleId = useId();
  const row = 'flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-[var(--hover)]';

  return (
    // The backdrop is the dialog itself; Escape closes it natively (see useModalDialog). It sits in
    // the top bar, which lets taps through to the map: the sheet takes them back.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={onBackdropClick}
      aria-labelledby={titleId}
      className="pointer-events-auto mx-auto mt-auto mb-0 w-full max-w-md rounded-t-3xl bg-[var(--surface)] p-0 pb-[var(--safe-bottom)] text-[var(--text)] shadow-2xl outline-none backdrop:bg-[#253326]/30"
    >
      <div className="max-h-[85dvh] overflow-y-auto px-2 pt-3 pb-2">
        <header className="flex items-center justify-between px-3 pb-1">
          <h2 id={titleId} className="font-semibold">
            {t('tools.more')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-[var(--hover)]"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <ul>
          {items.map(({ label, icon: Icon, active, onClick }) => (
            <li key={label}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => {
                  onClose();
                  onClick();
                }}
                className={`${row} ${active ? 'text-[var(--accent)]' : ''}`}
              >
                <Icon className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                {label}
              </button>
            </li>
          ))}
          <li>
            <button type="button" aria-expanded={display} onClick={() => setDisplay(!display)} className={row}>
              <Accessibility className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <span className="flex-1">{t('display.menu')}</span>
              <ChevronDown className={`h-4 w-4 transition ${display ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {display && (
              <div className="px-3 pt-1 pb-3 text-sm">
                <DisplayOptions onLeave={onClose} />
              </div>
            )}
          </li>
        </ul>
        <a
          href={AUTHOR_URL}
          target="_blank"
          rel="noopener"
          className="mt-1 flex items-center justify-center gap-2 border-t border-[var(--hover)] pt-3 text-xs text-[var(--muted)]"
        >
          {t('brand.madeBy')}
          {/* The logo keeps its colours on a white plate, also in dark mode and high contrast. */}
          <span className="author-logo rounded-lg bg-white px-1">
            <AuthorLogo className="h-7" />
          </span>
        </a>
      </div>
    </dialog>
  );
}
