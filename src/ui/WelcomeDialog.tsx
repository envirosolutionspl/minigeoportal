import { useId } from 'react';
import { create } from 'zustand';
import { APP_NAME, AUTHOR_URL, AuthorLogo, BrandMark } from './Brand';
import { useReport } from './ReportDialog';
import { useAccessibility } from './AccessibilityDialog';
import { Content, type ContentAction } from './Content';
import { config } from '@/config/runtime';
import { useMapStore } from '@/state/store';
import { t } from '@/i18n';
import { Modal } from './Modal';
import { NewTab } from './NewTab';

const STORAGE_KEY = `${config.app.storagePrefix}welcome.v1`;

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hidden';
  } catch {
    return false;
  }
}

/** Seen once is enough, as on other public map sites; "About" brings the window back. */
function rememberDismissal(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'hidden');
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
  const titleId = useId();

  const close = () => {
    rememberDismissal();
    setOpen(false);
  };

  const act = (action: ContentAction) => {
    close();
    if (action === 'report') useReport.getState().openReport();
    if (action === 'accessibility') useAccessibility.getState().setOpen(true);
    // The time view, where the deployment has one (map.yaml: timeTravel).
    if (action === 'time' && config.map.timeTravel) useMapStore.getState().setTool('time');
  };

  return (
    <Modal open={open} onClose={close} labelledBy={titleId} className="w-[min(42rem,calc(100%-2rem))]" blur>
      {/* Only the text scrolls on a small screen: the way to the map stays in sight under it. */}
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="overflow-y-auto p-5 pb-0 sm:p-6 sm:pb-0">
          <header className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 shrink-0" />
            <div>
              <h2 id={titleId} className="text-lg font-bold tracking-tight">
                {APP_NAME}
              </h2>
              {config.app.tagline && <p className="text-sm text-[var(--muted)]">{config.app.tagline}</p>}
            </div>
          </header>

          {config.content.welcome && (
            <div className="mt-4 text-sm leading-normal">
              <Content html={config.content.welcome} onAction={act} />
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 pb-5 sm:px-6 sm:pb-6">
          <footer className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={close}
              // The window starts on its main action, not on the first link (see useModalDialog).
              data-autofocus=""
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
              <NewTab />
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
      </div>
    </Modal>
  );
}
