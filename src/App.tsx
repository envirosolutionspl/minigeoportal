import { useEffect } from 'react';
import { MapView } from './map/MapView';
import { TopBar } from './ui/TopBar';
import { LayerCatalog } from './ui/LayerCatalog';
import { useMapStore } from './state/store';
import { useStatusStore } from './services/status';

export default function App() {
  const panel = useMapStore((m) => m.panel);
  const probeAll = useStatusStore((s) => s.probeAll);

  useEffect(() => {
    void probeAll();
  }, [probeAll]);

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <MapView />
      <TopBar />
      <aside
        aria-hidden={panel !== 'catalog'}
        className={`absolute z-30 bg-[var(--surface)] shadow-2xl transition-transform duration-300 ease-out
          inset-x-0 bottom-0 h-[70dvh] rounded-t-3xl
          sm:inset-y-0 sm:right-0 sm:left-auto sm:h-auto sm:w-96 sm:rounded-none
          ${panel === 'catalog' ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-x-full sm:translate-y-0'}`}
      >
        <LayerCatalog />
      </aside>
    </div>
  );
}
