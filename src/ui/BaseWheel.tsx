import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { Ban } from 'lucide-react';
import type { BaseMap } from '@/config/runtime';
import { duration } from '@/map/motion';
import { t } from '@/i18n';

/** Height of a row and the rows in sight: the middle one is the chosen map. */
export const ROW = 48;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ROW;
/** A turn of the wheel counts as done when it has not moved for this long (no scrollend event). */
const SETTLE_MS = 140;

/**
 * Base maps on a wheel, like the time in a phone's clock: rows snap into the middle band, tilt
 * and fade away from it, and the map in the band is shown as soon as the wheel stops, so the map
 * behind changes while it turns. A tap on another row turns to it; a tap on the row in the band,
 * Enter, Escape or a tap outside closes it. Arrow keys turn it a row at a time. The rows are
 * painted on scroll straight in the DOM, not by React.
 */
export function BaseWheel({
  maps,
  current,
  onPick,
  onClose,
}: {
  maps: BaseMap[];
  current: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const picked = useRef(current);
  const settle = useRef<number | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const labelId = useId();
  /** A tap that began on the layer beside the wheel. */
  const tapped = useRef(false);

  const rows = () => [...(list.current?.querySelectorAll<HTMLElement>('[role=option]') ?? [])];
  const middle = () => Math.min(maps.length - 1, Math.max(0, Math.round((list.current?.scrollTop ?? 0) / ROW)));

  const paint = () => {
    frame.current = undefined;
    const at = (list.current?.scrollTop ?? 0) / ROW;
    rows().forEach((row, i) => {
      const d = i - at;
      row.style.transform = `rotateX(${(-d * 22).toFixed(1)}deg) scale(${(1 - Math.min(Math.abs(d), 3) * 0.06).toFixed(3)})`;
      row.style.opacity = String(Math.max(0.2, 1 - Math.abs(d) * 0.32));
      row.setAttribute('aria-selected', String(i === Math.round(at)));
    });
    // Screen readers follow the row in the band (the listbox keeps the focus).
    const band = rows()[Math.min(maps.length - 1, Math.max(0, Math.round(at)))];
    if (band) list.current?.setAttribute('aria-activedescendant', band.id);
  };

  /** The map in the middle band becomes the base map. */
  const pick = () => {
    const map = maps[middle()];
    if (!map || map.id === picked.current) return;
    picked.current = map.id;
    // A light tick where the phone can (Android); elsewhere nothing happens.
    navigator.vibrate?.(8);
    onPick(map.id);
  };

  const turnTo = (i: number) => {
    const top = Math.min(maps.length - 1, Math.max(0, i)) * ROW;
    list.current?.scrollTo({ top, behavior: duration(200) ? 'smooth' : 'auto' });
  };

  const onScroll = () => {
    frame.current ??= window.requestAnimationFrame(paint);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(pick, SETTLE_MS);
  };

  // Opens on the map that is on now, without turning there.
  useLayoutEffect(() => {
    const i = Math.max(
      0,
      maps.findIndex((m) => m.id === current),
    );
    if (list.current) list.current.scrollTop = i * ROW;
    paint();
    list.current?.focus({ preventScroll: true });
    // Only on opening: later the wheel itself changes `current`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && onClose();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
      window.clearTimeout(settle.current);
      if (frame.current !== undefined) window.cancelAnimationFrame(frame.current);
    };
  }, [onClose]);

  return (
    <div ref={root} className="contents">
      {/* A tap beside the wheel only closes it: this layer takes it, so the map under it neither
          pans nor answers the click with place information. It closes on the click, not on the
          press, so it stays until the whole tap is over, and only for a tap that began on it
          (not the end of the press and hold that opened the wheel). */}
      <div
        aria-hidden="true"
        data-testid="wheel-backdrop"
        className="fixed inset-0"
        onPointerDown={() => (tapped.current = true)}
        onClick={() => tapped.current && onClose()}
      />
      <div className="absolute bottom-full left-0 mb-3 w-60 overflow-hidden rounded-2xl bg-[var(--surface)] shadow-xl ring-1 ring-black/5">
        <p id={labelId} className="px-4 pt-3 text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">
          {t('basemaps.title')}
        </p>
        <div className="relative" style={{ height: VISIBLE * ROW }}>
          {/* The band the chosen map stops in. */}
          <div aria-hidden="true" className="absolute inset-x-2 rounded-xl bg-[var(--hover)]" style={{ top: PAD, height: ROW }} />
          <div
            ref={list}
            role="listbox"
            tabIndex={0}
            aria-labelledby={labelId}
            onScroll={onScroll}
            onKeyDown={(e) => {
              const i = middle();
              const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: maps.length - 1 }[e.key];
              if (to !== undefined) {
                e.preventDefault();
                turnTo(to);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick();
                onClose();
              }
            }}
            className="relative h-full snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [perspective:400px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ paddingBlock: PAD }}
          >
            {maps.map((m, i) => (
              // Choosing happens in the listbox (arrow keys, Enter), as the pattern requires.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <div
                key={m.id}
                id={`${labelId}-${i}`}
                role="option"
                tabIndex={-1}
                aria-selected={m.id === current}
                // A tap on the map in the band takes it and closes the wheel; on another row turns to it.
                onClick={() => {
                  if (i !== middle()) return turnTo(i);
                  pick();
                  onClose();
                }}
                className="flex snap-center items-center gap-3 px-4 text-[var(--text)] select-none [-webkit-touch-callout:none]"
                style={{ height: ROW }}
              >
                <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-[var(--map-bg)] ring-1 ring-black/10">
                  {m.thumb ? (
                    <img src={m.thumb} alt="" draggable={false} className="h-full w-full object-cover" />
                  ) : (
                    <Ban className="absolute inset-1.5 h-5 w-5 text-[#9db49e]" aria-hidden="true" />
                  )}
                </span>
                <span className="truncate font-medium">{m.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
