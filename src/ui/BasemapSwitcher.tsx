import { useEffect, useRef, useState } from 'react';
import { Ban, ChevronUp } from 'lucide-react';
import { BASE_MAPS, GEOPORTAL_MAP, type BaseMap } from '@/services/registry';
import { useMapStore } from '@/state/store';

/**
 * Base map switcher as in Google Maps: the thumbnail shows the base map one click switches to
 * (photos, or back to the last map used). Every base map is listed on hover or keyboard focus;
 * touch screens, which have no hover, get a small button that opens the list.
 */
export function BasemapSwitcher() {
  const base = useMapStore((m) => m.base);
  const setBase = useMapStore((m) => m.setBase);
  const lastMap = useRef(base === 'orto' ? 'mapa' : base);
  if (base !== 'orto') lastMap.current = base;
  const target = BASE_MAPS.find((b) => b.id === (base === 'orto' ? lastMap.current : 'orto'))!;

  /** Opened with the touch button. */
  const [open, setOpen] = useState(false);
  /** Keyboard focus inside the switcher shows the list, until Escape. */
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const shown = (open || focused) && !dismissed;

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      setDismissed(true);
      toggle.current?.focus();
    };
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [shown]);

  const choose = (id: string) => {
    setBase(id);
    setOpen(false);
  };

  return (
    <div
      ref={root}
      onFocus={(e) => focusVisible(e.target) && setFocused(true)}
      onBlur={(e) => {
        if (root.current?.contains(e.relatedTarget as Node)) return;
        setFocused(false);
        setDismissed(false);
      }}
      className="group pointer-events-auto absolute bottom-9 left-3 z-20 flex items-end gap-2 sm:bottom-10 sm:left-4"
    >
      <Thumb ref={toggle} def={target} size="lg" label={`Przełącz podkład na: ${target.title}`} onClick={() => setBase(target.id)} />
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={shown}
        aria-controls="basemap-list"
        aria-label="Wszystkie podkłady"
        className="-ml-1 flex h-9 w-9 items-center justify-center self-center rounded-full bg-[var(--surface)] text-[var(--accent)] shadow-lg ring-1 ring-black/5 [@media(hover:hover)]:hidden"
      >
        <ChevronUp className={`h-5 w-5 transition ${shown ? 'rotate-90' : '-rotate-90'}`} aria-hidden="true" />
      </button>
      <div
        id="basemap-list"
        role="group"
        aria-label="Podkłady"
        className={`${shown ? 'flex' : 'hidden'} gap-2 rounded-2xl bg-[var(--surface)] p-2 shadow-lg ring-1 ring-black/5 [@media(hover:hover)]:group-hover:flex`}
      >
        {/* The thumbnail's own base map is one click away, so the list leaves it out. */}
        {BASE_MAPS.filter((b) => b.id !== target.id).map((b) => (
          <Thumb key={b.id} def={b} size="sm" active={b.id === base} onClick={() => choose(b.id)} />
        ))}
      </div>
    </div>
  );
}

/** Keyboard focus, not a click: only then does focus open the list. */
function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

function Thumb({
  ref,
  def,
  size,
  active,
  label: name,
  onClick,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  def: BaseMap;
  size: 'sm' | 'lg';
  active?: boolean;
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
      aria-pressed={size === 'sm' ? active : undefined}
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
