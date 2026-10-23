import { useId, useState } from 'react';
import { create } from 'zustand';
import { APP_NAME, AUTHOR_URL, AuthorLogo, BrandMark } from './Brand';
import { useReport } from './ReportDialog';
import { useAccessibility } from './AccessibilityDialog';
import { Content, type ContentAction } from './Content';
import { config } from '@/config/runtime';
import { t } from '@/i18n';
import { useModalDialog } from './useModalDialog';

const STORAGE_KEY = `${config.app.storagePrefix}welcome.v1`;

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hidden';
  } catch {
    return false;
  }
}

function rememberDismissal(hide: boolean): void {
  try {
    if (hide) localStorage.setItem(STORAGE_KEY, 'hidden');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the dialog simply shows again next time.
  }
}

/** Open state is shared so the info button can reopen the dialog; first visits see it when there is a welcome text. */
export const useWelcome = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: Boolean(config.content.welcome) && !dismissedBefore(),
  setOpen: (open) => set({ open }),
}));

/** Information window shown on the first visit, as on public geoportals. */
export function WelcomeDialog() {
  const open = useWelcome((s) => s.open);
  const setOpen = useWelcome((s) => s.setOpen);
  const [hide, setHide] = useState(dismissedBefore);
  const titleId = useId();

  const close = () => {
    rememberDismissal(hide);
    setOpen(false);
  };
  const { ref, onBackdropClick } = useModalDialog(open, close);

  const act = (action: ContentAction) => {
    close();
    if (action === 'report') useReport.getState().openReport();
    if (action === 'accessibility') useAccessibility.getState().setOpen(true);
  };

  return (
    <>
      {/* The backdrop is the dialog itself; Escape closes it natively (see useModalDialog). */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={ref}
        onClose={close}
        onClick={onBackdropClick}
        aria-labelledby={titleId}
        className="m-auto w-[min(42rem,calc(100%-2rem))] rounded-3xl outline-none bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-[#253326]/50 backdrop:backdrop-blur-[2px]"
      >
        <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6">
          <header className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 shrink-0" />
            <div>
              <h1 id={titleId} className="text-lg font-bold tracking-tight">
                {APP_NAME}
              </h1>
              {config.app.tagline && <p className="text-sm text-[var(--muted)]">{config.app.tagline}</p>}
            </div>
          </header>

          {config.content.welcome && (
            <div className="mt-4 text-sm leading-normal">
              <Content html={config.content.welcome} onAction={act} />
            </div>
          )}

          <footer className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                checked={hide}
                onChange={(e) => setHide(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              {t('welcome.dontShow')}
            </label>
            <button
              type="button"
              onClick={close}
              // In a modal, autofocus names the element to start on: the main action, not the checkbox.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="rounded-2xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--on-accent)] transition hover:brightness-110"
            >
              {t('welcome.start')}
            </button>
          </footer>

          {/* Links and the author in one row, so the window fits a laptop screen without scrolling;
              the author's logo in the middle, between the two links. */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-[var(--hover)] pt-2 text-sm sm:grid sm:grid-cols-[1fr_auto_1fr]">
            <button
              type="button"
              onClick={() => act('report')}
              className="min-h-6 text-[var(--accent)] underline underline-offset-2 hover:no-underline sm:justify-self-start"
            >
              {t('report.title')}
            </button>
            <a href={AUTHOR_URL} target="_blank" rel="noopener" className="flex items-center gap-2 text-xs text-[var(--muted)]">
              {t('brand.madeBy')}
              <span className="rounded-lg bg-white px-1">
                <AuthorLogo className="h-10" />
              </span>
            </a>
            {config.content.accessibility && (
              <button
                type="button"
                onClick={() => act('accessibility')}
                className="min-h-6 text-[var(--accent)] underline underline-offset-2 hover:no-underline sm:justify-self-end"
              >
                {t('accessibility.title')}
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
