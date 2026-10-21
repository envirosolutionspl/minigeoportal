import { useRef } from 'react';
import { Ban } from 'lucide-react';
import { BASE_MAPS, GEOPORTAL_MAP, type BaseMap } from '@/services/registry';
import { useMapStore } from '@/state/store';

/**
 * Base map switcher in the style of consumer maps: one thumbnail toggles between
 * photos and the last used map; hovering or focusing it reveals every base map.
 */
export function BasemapSwitcher() {
  const base = useMapStore((m) => m.base);
  const setBase = useMapStore((m) => m.setBase);
  const lastMap = useRef(base === 'orto' ? 'mapa' : base);
  if (base !== 'orto') lastMap.current = base;

  const toggleTarget = BASE_MAPS.find((b) => b.id === (base === 'orto' ? lastMap.current : 'orto'))!;

  return (
    <div className="group pointer-events-auto absolute bottom-9 left-3 z-20 flex items-end gap-2 sm:bottom-10 sm:left-4">
      <Thumb def={toggleTarget} size="lg" onClick={() => setBase(toggleTarget.id)} />
      <div className="hidden gap-2 rounded-2xl bg-[var(--surface)] p-2 shadow-lg ring-1 ring-black/5 group-focus-within:flex group-hover:flex">
        {BASE_MAPS.map((b) => (
          <Thumb key={b.id} def={b} size="sm" active={b.id === base} onClick={() => setBase(b.id)} />
        ))}
      </div>
    </div>
  );
}

function Thumb({
  def,
  size,
  active,
  onClick,
}: {
  def: BaseMap;
  size: 'sm' | 'lg';
  active?: boolean;
  onClick: () => void;
}) {
  const src = def.thumb;
  const box = size === 'lg' ? 'h-16 w-16 rounded-2xl shadow-lg ring-2 ring-white/90' : 'h-14 w-14 rounded-xl ring-2';
  const label = (
    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pt-3 pb-0.5 text-[10px] font-medium text-white">
      {def.title}
    </span>
  );
  // Restricted base maps stay visible but lead to geoportal.gov.pl, where they work.
  if (def.restricted) {
    return (
      <a
        href={GEOPORTAL_MAP}
        target="_blank"
        rel="noopener"
        title="Dostępne tylko na geoportal.gov.pl"
        className={`relative shrink-0 overflow-hidden bg-[var(--field)] opacity-50 grayscale ${box} ring-transparent`}
      >
        {src && <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />}
        {label}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`Podkład: ${def.title}`}
      title={def.description}
      className={`relative shrink-0 overflow-hidden bg-[var(--map-bg)] transition ${box} ${
        active ? 'ring-[var(--accent)]' : size === 'sm' ? 'ring-transparent hover:ring-[var(--hover)]' : ''
      }`}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <Ban className="absolute top-2 left-1/2 h-6 w-6 -translate-x-1/2 text-[#9db49e]" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
