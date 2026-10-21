import { useEffect, useRef, useState } from 'react';
import { Ban } from 'lucide-react';
import { BASE_MAPS, GEOPORTAL_MAP, type BaseMap } from '@/services/registry';
import { useMapStore } from '@/state/store';

/**
 * Base map switcher: a thumbnail of the base map in use; clicking it (or hovering with a mouse)
 * shows every base map to choose from.
 */
export function BasemapSwitcher() {
  const base = useMapStore((m) => m.base);
  const setBase = useMapStore((m) => m.setBase);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const current = BASE_MAPS.find((b) => b.id === base) ?? BASE_MAPS[0];

  // Escape or a click elsewhere closes the list.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      toggle.current?.focus();
    };
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const choose = (id: string) => {
    setBase(id);
    setOpen(false);
  };

  return (
    <div ref={root} className="group pointer-events-auto absolute bottom-9 left-3 z-20 flex items-end gap-2 sm:bottom-10 sm:left-4">
      <Thumb
        ref={toggle}
        def={current}
        size="lg"
        label={`Podkład: ${current.title}. Zmień podkład`}
        expanded={open}
        onClick={() => setOpen(!open)}
      />
      <div
        id="basemap-list"
        role="group"
        aria-label="Podkłady"
        className={`${open ? 'flex' : 'hidden [@media(hover:hover)]:group-hover:flex'} gap-2 rounded-2xl bg-[var(--surface)] p-2 shadow-lg ring-1 ring-black/5`}
      >
        {BASE_MAPS.map((b) => (
          <Thumb key={b.id} def={b} size="sm" active={b.id === base} onClick={() => choose(b.id)} />
        ))}
      </div>
    </div>
  );
}

function Thumb({
  ref,
  def,
  size,
  active,
  expanded,
  label: name,
  onClick,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  def: BaseMap;
  size: 'sm' | 'lg';
  active?: boolean;
  /** For the main thumbnail: whether the list is open. */
  expanded?: boolean;
  label?: string;
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
  if (def.restricted && size === 'sm') {
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
      ref={ref}
      type="button"
      onClick={onClick}
      aria-pressed={expanded === undefined ? active : undefined}
      aria-expanded={expanded}
      aria-controls={expanded === undefined ? undefined : 'basemap-list'}
      aria-label={name ?? `Podkład: ${def.title}`}
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
