import { useId } from 'react';
import { create } from 'zustand';
import { config } from '@/config/runtime';
import { t } from '@/i18n';
import { Content, type ContentAction } from './Content';
import { useWelcome } from './WelcomeDialog';
import { useReport } from './ReportDialog';
import { Modal } from './Modal';
import { CloseButton } from './CloseButton';

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
  const close = () => setOpen(false);

  const act = (action: ContentAction) => {
    setOpen(false);
    if (action === 'report') useReport.getState().openReport();
    if (action === 'welcome') useWelcome.getState().setOpen(true);
  };

  return (
    <Modal open={open} onClose={close} labelledBy={`${id}-title`} className="w-[min(40rem,calc(100%-2rem))]">
      <div className="max-h-[85dvh] overflow-y-auto p-6 text-sm leading-relaxed sm:p-8">
        <header className="mb-4 flex items-start gap-3">
          <h2 id={`${id}-title`} className="flex-1 text-xl font-bold">
            {t('accessibility.title')}
          </h2>
          <CloseButton onClick={close} />
        </header>

        <Content html={config.content.accessibility ?? ''} onAction={act} />
      </div>
    </Modal>
  );
}
