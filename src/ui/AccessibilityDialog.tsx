import { useId } from 'react';
import { create } from 'zustand';
import { X } from 'lucide-react';
import { config } from '@/config/runtime';
import { t } from '@/i18n';
import { Content, type ContentAction } from './Content';
import { useWelcome } from './WelcomeDialog';
import { useReport } from './ReportDialog';
import { useModalDialog } from './useModalDialog';

export const useAccessibility = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/**
 * Accessibility statement (config/content/accessibility.*.md); the default one follows the
 * structure the Polish act on digital accessibility requires, against WCAG 2.1 AA (EN 301 549).
 */
export function AccessibilityDialog() {
  const open = useAccessibility((s) => s.open);
  const setOpen = useAccessibility((s) => s.setOpen);
  const id = useId();
  const { ref, onBackdropClick } = useModalDialog(open, () => setOpen(false));

  const act = (action: ContentAction) => {
    setOpen(false);
    if (action === 'report') useReport.getState().openReport();
    if (action === 'welcome') useWelcome.getState().setOpen(true);
  };

  return (
    <>
      {/* The backdrop is the dialog itself; Escape closes it natively (see useModalDialog). */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={onBackdropClick}
        aria-labelledby={`${id}-title`}
        className="m-auto w-[min(40rem,calc(100%-2rem))] rounded-3xl bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl outline-none backdrop:bg-[#253326]/50"
      >
        <div className="max-h-[85dvh] overflow-y-auto p-6 text-sm leading-relaxed sm:p-8">
          <header className="mb-4 flex items-start gap-3">
            <h2 id={`${id}-title`} className="flex-1 text-xl font-bold">
              {t('accessibility.title')}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('common.close')}
              className="rounded-full p-2 hover:bg-[var(--hover)]"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <Content html={config.content.accessibility ?? ''} onAction={act} />
        </div>
      </dialog>
    </>
  );
}
