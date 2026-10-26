import { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, ChevronUp } from 'lucide-react';
import { config, type BaseMap } from '@/config/runtime';
import { t } from '@/i18n';
import { useMapStore } from '@/state/store';
import { BaseWheel } from './BaseWheel';

const { view, baseMaps } = config.map;
/** The base map one click switches to (map.yaml: view.toggleBase, the photos), and back from. */
const TOGGLE = view.toggleBase ?? baseMaps.find((b) => b.id !== view.base)?.id ?? view.base;

/** Press and hold for this long on the thumbnail: the wheel of all base maps. */
const HOLD_MS = 450;
/** A finger that moves this far is panning, not holding. */
const HOLD_SLOP_PX = 10;

/**
 * Pressing and holding: `onHold` after HOLD_MS unless the pointer moved or let go first; the
 * click that ends a hold is swallowed (`held()` says so once).
 */
function useHold(onHold: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<[number, number] | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };
  useEffect(() => cancel, []);
  return {
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        // Phones and tablets only: with a mouse the list opens on hover.
        if (e.button !== 0 || e.pointerType === 'mouse') return;
        fired.current = false;
        start.current = [e.clientX, e.clientY];
        timer.current = window.setTimeout(() => {
          fired.current = true;
          start.current = null;
          onHold();
        }, HOLD_MS);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]) > HOLD_SLOP_PX) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      // No system menu (save image, copy) under a held finger.
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    held: () => {
      const was = fired.current;
      fired.current = false;
      return was;
    },
  };
}

/**
 * Base map switcher as in Google Maps: the thumbnail shows the base map one click switches to
 * (photos, or back to the last map used). Every base map is listed on hover or keyboard focus;
 * touch screens, which have no hover, get a small button that opens the list, and pressing and
 * holding the thumbnail turns up a wheel of all base maps, as the time in a phone's clock.
 */
export function BasemapSwitcher() {
  const base = useMapStore((m) => m.base);
  const setBase = useMapStore((m) => m.setBase);
  // The map to go back to from the photos: the last one that was not the photos.
  const [lastMap, setLastMap] = useState(base === TOGGLE ? view.base : base);
  useEffect(() => {
    if (base !== TOGGLE) setLastMap(base);
  }, [base]);
  const target = baseMaps.find((b) => b.id === (base === TOGGLE ? lastMap : TOGGLE)) ?? baseMaps[0];

  /** Opened with the touch button. */
  const [open, setOpen] = useState(false);
  /** Keyboard focus inside the switcher shows the list, until Escape. */
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const shown = (open || focused) && !dismissed;
  const [wheel, setWheel] = useState(false);
  const hold = useHold(() => {
    setOpen(false);
    setWheel(true);
  });
  const closeWheel = useCallback(() => setWheel(false), []);

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
      className="group pointer-events-auto absolute bottom-[calc(2.25rem+var(--safe-bottom))] left-3 z-30 flex items-end gap-2 sm:bottom-[calc(2.5rem+var(--safe-bottom))] sm:left-4"
    >
      <Thumb
        ref={toggle}
        def={target}
        size="lg"
        label={t('basemaps.switchTo', { title: target.title })}
        press={hold.handlers}
        onClick={() => !hold.held() && setBase(target.id)}
      />
      {wheel && <BaseWheel maps={baseMaps} current={base} onPick={setBase} onClose={closeWheel} />}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={shown}
        aria-controls="basemap-list"
        aria-label={t('basemaps.all')}
        className="-ml-1 flex h-9 w-9 items-center justify-center self-center rounded-full bg-[var(--surface)] text-[var(--accent)] shadow-lg ring-1 ring-black/5 [@media(hover:hover)]:hidden"
      >
        <ChevronUp className={`h-5 w-5 transition ${shown ? 'rotate-90' : '-rotate-90'}`} aria-hidden="true" />
      </button>
      <div
        id="basemap-list"
        role="group"
        aria-label={t('basemaps.title')}
        className={`${shown ? 'flex' : 'hidden'} max-w-[calc(100vw-8.5rem)] flex-wrap gap-2 rounded-2xl bg-[var(--surface)] p-2 shadow-lg ring-1 ring-black/5 [@media(hover:hover)]:group-hover:flex`}
      >
        {/* The thumbnail's own base map is one click away, so the list leaves it out. */}
        {config.map.baseMaps
          .filter((b) => b.id !== target.id)
          .map((b) => (
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
  press,
  onClick,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  def: BaseMap;
  size: 'sm' | 'lg';
  active?: boolean;
  label?: string;
  /** Pointer handlers of a press and hold (the thumbnail's wheel). */
  press?: React.HTMLAttributes<HTMLButtonElement>;
  onClick: () => void;
}) {
  const src = def.thumb;
  const box = size === 'lg' ? 'h-16 w-16 rounded-2xl shadow-lg ring-2 ring-white/90' : 'h-14 w-14 rounded-xl ring-2';
  const label = (
    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pt-3 pb-0.5 text-[11px] font-medium text-white">
      {def.title}
    </span>
  );
  return (
    <button
      ref={ref}
      type="button"
      {...press}
      onClick={onClick}
      aria-pressed={size === 'sm' ? active : undefined}
      aria-label={name ?? t('basemaps.one', { title: def.title })}
      title={def.description}
      className={`relative shrink-0 overflow-hidden bg-[var(--map-bg)] transition select-none [-webkit-touch-callout:none] ${box} ${
        active ? 'ring-[var(--accent)]' : size === 'sm' ? 'ring-transparent hover:ring-[var(--hover)]' : ''
      }`}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <Ban className="absolute top-2 left-1/2 h-6 w-6 -translate-x-1/2 text-[#9db49e]" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
