import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Navigation } from 'lucide-react';
import { config } from '@/config/runtime';
import { coordinateTexts, directionsUrl, formatCoordinate } from '@/map/format';
import { useMapMenu } from '@/state/mapMenu';
import { t } from '@/i18n';
import { useNotice } from './Notice';
import { NewTab } from './NewTab';

/** Distance kept from the edges of the screen. */
const EDGE = 8;
/** The confirmation of a copy goes by itself this soon, unless pointed at or focused. */
const COPIED_MS = 2000;

/**
 * Context menu of a place on the map (map/contextMenu.ts opens it): its coordinates to copy in
 * the map's system and in WGS 84, and directions to it in Google Maps. A menu as the pattern
 * describes it: the first item takes the focus, arrow keys move, Escape and Tab close.
 */
export function MapMenu() {
  const at = useMapMenu((s) => s.at);
  const close = useMapMenu((s) => s.close);
  const { say, notice } = useNotice();
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  // Beside the pointer, turned to the other side where it would leave the screen.
  useLayoutEffect(() => {
    const el = box.current;
    if (!at || !el) return setPlace(null);
    const parent = el.offsetParent as HTMLElement | null;
    const width = parent?.clientWidth || window.innerWidth;
    const height = parent?.clientHeight || window.innerHeight;
    const [x, y] = at.pixel;
    const { offsetWidth: w, offsetHeight: h } = el;
    const left = x + w + EDGE > width ? Math.max(EDGE, x - w) : x;
    const top = y + h + EDGE > height ? Math.max(EDGE, y - h) : y;
    setPlace({ left, top });
  }, [at]);

  // The first item takes the focus once the menu is placed: hidden while measured, it could not.
  useEffect(() => {
    if (place) box.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus({ preventScroll: true });
  }, [place]);

  // A press outside the menu and the map closes it; on the map a click or a move does (contextMenu.ts).
  useEffect(() => {
    if (!at) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!box.current?.contains(target) && !document.getElementById('map')?.contains(target)) close();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [at, close]);

  const leave = (focusMap = at?.byKeyboard) => {
    close();
    if (focusMap) document.getElementById('map')?.focus();
  };

  const copy = async (text: string) => {
    leave();
    try {
      await navigator.clipboard.writeText(text);
      say(t('mapMenu.copied', { text }), COPIED_MS);
    } catch {
      // No clipboard access (e.g. an insecure page): the text is shown to copy by hand.
      say(text);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (to !== undefined) {
      e.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      leave(true);
    } else if (e.key === 'Tab') {
      leave(false);
    }
  };

  const texts = at && coordinateTexts(at.coordinate);
  const item =
    'flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)] phone:min-h-11';

  return (
    <>
      {at && texts && (
        <div
          ref={box}
          // Measured first, out of sight, then placed (see above).
          style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: 'hidden' }}
          className="absolute z-[45] w-max max-w-[calc(100%-1rem)] rounded-2xl bg-[var(--surface)] p-1.5 text-[var(--text)] shadow-xl ring-1 ring-black/5"
        >
          <p className="px-3 pt-1 pb-1.5 text-xs text-[var(--muted)]">{formatCoordinate(at.coordinate)}</p>
          {/* Keys move between the items, which the menu pattern asks of its container. */}
          {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
          <div role="menu" aria-label={t('mapMenu.title')} onKeyDown={onKeyDown}>
            <button type="button" role="menuitem" tabIndex={-1} onClick={() => void copy(texts.system)} className={item}>
              <Copy className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              {t('mapMenu.copySystem', { system: config.map.projection.name })}
            </button>
            <button type="button" role="menuitem" tabIndex={-1} onClick={() => void copy(texts.wgs84)} className={item}>
              <Copy className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              {t('mapMenu.copyWgs84')}
            </button>
            <a
              role="menuitem"
              tabIndex={-1}
              href={directionsUrl(at.coordinate)}
              target="_blank"
              rel="noopener"
              onClick={() => leave(false)}
              className={item}
            >
              <Navigation className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              {t('mapMenu.directions')}
              <NewTab />
            </a>
          </div>
        </div>
      )}
      {notice}
    </>
  );
}
