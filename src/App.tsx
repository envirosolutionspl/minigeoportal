import { useEffect } from 'react';
import { MapView } from './map/MapView';
import { TopBar } from './ui/TopBar';
import { LayerCatalog } from './ui/LayerCatalog';
import { BasemapSwitcher } from './ui/BasemapSwitcher';
import { InfoPanel } from './ui/InfoPanel';
import { MeasureBar } from './ui/MeasureBar';
import { WelcomeDialog } from './ui/WelcomeDialog';
import { ReportDialog } from './ui/ReportDialog';
import { PrintPanel, PrintSheet } from './ui/Print';
import { AccessibilityDialog } from './ui/AccessibilityDialog';
import { useInfoStore } from './state/info';
import { AuthorCredit } from './ui/Brand';
import { t } from '@/i18n';
import { useMapStore } from './state/store';

export default function App() {
  const panel = useMapStore((m) => m.panel);

  // Escape closes the place panel, then the layer list; open dialogs close themselves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      const { tool, setTool } = useMapStore.getState();
      if (tool === 'print') return setTool('none');
      if (tool !== 'none') return;
      const info = useInfoStore.getState();
      if (info.query) info.close();
      else if (useMapStore.getState().panel !== 'none') useMapStore.getState().setPanel('none');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Phones held sideways: the app keeps clear of the notch (viewport-fit=cover lets the page under it).
  return (
    <div data-panel={panel} className="relative mr-[env(safe-area-inset-right)] ml-[env(safe-area-inset-left)] h-dvh overflow-hidden">
      <nav aria-label={t('app.skipLinks')} className="skip-links">
        <a href="#map">{t('app.skipToMap')}</a>
        <a href="#search">{t('app.skipToSearch')}</a>
      </nav>
      <MapView />
      <TopBar />
      <BasemapSwitcher />
      <InfoPanel />
      <MeasureBar />
      <PrintPanel />
      <AuthorCredit />
      <aside
        aria-hidden={panel !== 'catalog'}
        inert={panel !== 'catalog'}
        className={`absolute z-40 bg-[var(--surface)] shadow-2xl transition-transform duration-300 ease-out
          inset-x-0 bottom-0 h-[70dvh] rounded-t-3xl pb-[var(--safe-bottom)]
          sm:inset-y-0 sm:right-0 sm:left-auto sm:h-auto sm:w-96 sm:rounded-none
          ${panel === 'catalog' ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full sm:translate-y-0'}`}
      >
        <LayerCatalog />
      </aside>
      <WelcomeDialog />
      <ReportDialog />
      <PrintSheet />
      <AccessibilityDialog />
    </div>
  );
}
