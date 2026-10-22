import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Home,
  Info,
  Landmark,
  Layers,
  Link2,
  LocateFixed,
  Mountain,
  Printer,
  Route,
  Ruler,
  Search,
  SquareDashed,
  X,
  type LucideIcon,
} from 'lucide-react';
import { fromLonLat } from 'ol/proj';
import { buildingAt, placeOutline, search, unitOutline, type HitKind, type SearchHit } from '@/services/geocoder';
import { useMapStore } from '@/state/store';
import { useInfoStore } from '@/state/info';
import { openPrint } from '@/map/print';
import { linkFor } from '@/state/url';
import { APP_NAME, BrandMark, Wordmark } from './Brand';
import { useWelcome } from './WelcomeDialog';
import { PARCEL_ZOOM, ParcelSearch } from './ParcelSearch';
import { PROJECTION } from '@/map/projection';
import { DisplayMenu } from './DisplayMenu';

/** Closest zoom per hit kind on the GUGiK scale series (13 = 1:1890, 14 = 1:945, 15 = 1:472). */
const ZOOM: Record<HitKind, number> = { address: 14, street: 14, place: 12, unit: 14, nature: 12, parcel: PARCEL_ZOOM };
const ICON: Record<HitKind, LucideIcon> = {
  address: Home,
  street: Route,
  place: Building2,
  unit: Landmark,
  nature: Mountain,
  parcel: SquareDashed,
};
const OUTLINE_TIMEOUT_MS = 2500;
/** A unit has no point to fall back on, so its boundary may take longer. */
const UNIT_TIMEOUT_MS = 8000;

export function TopBar() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Highlighted hit for arrow keys; -1 means none. */
  const [active, setActive] = useState(-1);
  /** What screen readers hear once a search finishes. */
  const [announce, setAnnounce] = useState('');
  const [parcelOpen, setParcelOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const picked = useRef(0);
  /** Set when choosing a hit writes its name into the box, which is not a new search. */
  const chosen = useRef(false);
  const focusOn = useMapStore((m) => m.focusOn);
  const clearFocus = useMapStore((m) => m.clearFocus);
  const goHome = useMapStore((m) => m.goHome);
  const panel = useMapStore((m) => m.panel);
  const setPanel = useMapStore((m) => m.setPanel);
  const tool = useMapStore((m) => m.tool);
  const setTool = useMapStore((m) => m.setTool);
  const measuring = tool === 'measure-line' || tool === 'measure-area';
  /** Message after copying the link; read out by screen readers. */
  const [copied, setCopied] = useState('');
  const openWelcome = useWelcome((w) => w.setOpen);

  useEffect(() => {
    abort.current?.abort();
    if (chosen.current) {
      chosen.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 3) {
      setHits([]);
      setAnnounce('');
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const found = await search(q, controller.signal);
        if (controller.signal.aborted) return;
        setHits(found);
        setActive(-1);
        setAnnounce(
          found.length ? `Wyników: ${found.length}. Strzałki w dół i w górę wybierają, Enter pokazuje na mapie.` : 'Brak wyników.',
        );
        setOpen(true);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setHits([]);
      } finally {
        // A newer search owns the spinner now; otherwise this one turns it off.
        if (abort.current === controller) setBusy(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const listOpen = !parcelOpen && open && (hits.length > 0 || busy);

  const pick = async (hit: SearchHit) => {
    const mine = ++picked.current;
    const text = hit.detail && (hit.kind === 'address' || hit.kind === 'street') ? `${hit.label}, ${hit.detail}` : hit.label;
    // Only a changed text runs the search effect, which then skips this one change.
    chosen.current = text !== query;
    setQuery(text);
    setOpen(false);
    setParcelOpen(false);
    let wkt = hit.wkt;
    // Parcels, units and river courses stay on the map until the search is cleared.
    let persist = hit.kind === 'parcel' || hit.kind === 'unit' || (hit.kind === 'nature' && Boolean(hit.wkt));
    // Places and addresses come as points; their outline (town boundary, building) is looked up
    // separately, without delaying the map for long.
    const signal = AbortSignal.timeout(OUTLINE_TIMEOUT_MS);
    if (hit.kind === 'place') wkt = await placeOutline(hit, signal).catch(() => undefined);
    if (hit.unit) wkt = await unitOutline(hit.unit, AbortSignal.timeout(UNIT_TIMEOUT_MS)).catch(() => undefined);
    if (hit.kind === 'address' && hit.center) {
      const building = await buildingAt(hit.center, signal).catch(() => undefined);
      if (building) {
        wkt = building;
        persist = true;
      }
    }
    // A later pick wins, even when its outline arrives first.
    if (mine !== picked.current) return;
    focusOn({ wkt, center: hit.center, zoom: ZOOM[hit.kind], persist });
  };

  const clear = () => {
    setQuery('');
    clearFocus();
  };

  /** Link to this view with the base map and the layers that are on, ready to paste. */
  const copyLink = async () => {
    const link = linkFor(useMapStore.getState());
    try {
      await navigator.clipboard.writeText(link);
      setCopied('Skopiowano link do tego widoku mapy.');
    } catch {
      // No clipboard access (e.g. an insecure page): the link is shown to copy by hand.
      setCopied(link);
    }
    window.setTimeout(() => setCopied(''), 4000);
  };

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const c = fromLonLat([pos.coords.longitude, pos.coords.latitude], PROJECTION);
        focusOn({ center: [c[0], c[1]], zoom: ZOOM.address });
      },
      undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-3 sm:p-4">
      <div className="search-box pointer-events-auto relative w-full max-w-lg">
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface)] py-1.5 pr-3 pl-1.5 shadow-lg ring-1 ring-black/5 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[var(--accent)]">
          <button
            type="button"
            onClick={goHome}
            title="Cała Polska"
            aria-label={`${APP_NAME}: pokaż całą Polskę`}
            className="flex shrink-0 items-center gap-2 rounded-xl py-0.5 pr-2 pl-0.5 hover:bg-[var(--hover)]"
          >
            <BrandMark />
            <span className="hidden md:inline">
              <Wordmark />
            </span>
          </button>
          <span className="h-6 w-px shrink-0 bg-[var(--hover)]" aria-hidden="true" />
          <Search className="h-5 w-5 shrink-0 text-[var(--muted)]" aria-hidden="true" />
          <input
            id="search"
            type="search"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls="search-results"
            aria-autocomplete="list"
            aria-activedescendant={listOpen && active >= 0 ? `search-hit-${active}` : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => hits.length > 0 && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (hits.length === 0) return;
                e.preventDefault();
                setOpen(true);
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setActive((i) => (i + step + hits.length) % hits.length);
              }
              if (e.key === 'Enter' && hits.length > 0) void pick(hits[Math.max(active, 0)]);
              if (e.key === 'Escape' && listOpen) {
                e.stopPropagation();
                setOpen(false);
              }
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder="Adres, miejscowość, działka…"
            aria-label="Szukaj adresu, miejscowości lub działki"
            autoComplete="off"
            // 16 px on phones keeps iOS from zooming into the field; from sm up it matches the "Działka" toggle and the hits.
            className="h-8 w-full bg-transparent text-base outline-none placeholder:text-[var(--muted)] sm:text-sm"
          />
          {query && (
            <button type="button" onClick={clear} aria-label="Wyczyść" className="rounded-full p-1 hover:bg-[var(--hover)]">
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setParcelOpen(!parcelOpen)}
            aria-expanded={parcelOpen}
            title="Znajdź działkę po numerze i obrębie"
            aria-label="Znajdź działkę po numerze i obrębie"
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1 text-sm transition ${
              parcelOpen ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--accent)] hover:bg-[var(--hover)]'
            }`}
          >
            <SquareDashed className="h-4 w-4" />
            <span className="hidden sm:inline">Działka</span>
          </button>
        </div>
        {parcelOpen && <ParcelSearch onClose={() => setParcelOpen(false)} />}
        <ul
          id="search-results"
          role="listbox"
          aria-label="Wyniki wyszukiwania"
          hidden={!listOpen}
          className="absolute inset-x-0 mt-2 overflow-hidden rounded-2xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-black/5"
        >
          {hits.map((h, i) => {
            const Icon = ICON[h.kind];
            return (
              // Keyboard choice happens in the combobox input (arrows and Enter), as the pattern requires.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={`${i}-${h.label}-${h.detail ?? ''}`}
                id={`search-hit-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void pick(h)}
                className={`flex cursor-pointer items-start gap-3 px-4 py-2 hover:bg-[var(--hover)] ${i === active ? 'bg-[var(--hover)]' : ''}`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm">{h.label}</span>
                  {h.detail && <span className="block truncate text-xs text-[var(--muted)]">{h.detail}</span>}
                </span>
              </li>
            );
          })}
          {busy && hits.length === 0 && (
            <li role="presentation" className="px-4 py-2 text-sm text-[var(--muted)]">
              Szukam…
            </li>
          )}
        </ul>
        <p role="status" className="sr-only">
          {parcelOpen ? '' : announce}
        </p>
      </div>

      {/* One column on every screen, under the search bar on phones, so the tools never change shape. */}
      {/* Most used first: layers, then working on the map, sharing, and help at the bottom. */}
      <div className="map-tools pointer-events-auto absolute top-[4.25rem] right-3 flex flex-col gap-2 sm:top-4 sm:right-4">
        <IconButton label="Warstwy" active={panel === 'catalog'} onClick={() => setPanel(panel === 'catalog' ? 'none' : 'catalog')}>
          <Layers className="h-5 w-5" />
        </IconButton>
        <IconButton label="Moja lokalizacja" onClick={locate}>
          <LocateFixed className="h-5 w-5" />
        </IconButton>
        <IconButton label="Pomiar odległości i powierzchni" active={measuring} onClick={() => setTool(measuring ? 'none' : 'measure-line')}>
          <Ruler className="h-5 w-5" />
        </IconButton>
        <IconButton label="Kopiuj link do tego widoku mapy" onClick={() => void copyLink()}>
          <Link2 className="h-5 w-5" />
        </IconButton>
        <IconButton
          label="Drukuj mapę"
          active={tool === 'print'}
          onClick={() => {
            // The print panel takes the place panel's spot on the left.
            useInfoStore.getState().close();
            if (tool === 'print') setTool('none');
            else openPrint();
          }}
        >
          <Printer className="h-5 w-5" />
        </IconButton>
        <DisplayMenu />
        <IconButton label="O serwisie" onClick={() => openWelcome(true)}>
          <Info className="h-5 w-5" />
        </IconButton>
      </div>
      <p
        role="status"
        className={`pointer-events-auto fixed bottom-20 left-1/2 z-50 max-w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl bg-[var(--text)] px-4 py-2 text-sm break-all text-[var(--surface)] shadow-lg ${
          copied ? '' : 'sr-only'
        }`}
      >
        {copied}
      </p>
    </div>
  );
}

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg ring-1 ring-black/5 transition ${
        active ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--surface)] hover:bg-[var(--hover)]'
      }`}
    >
      {children}
    </button>
  );
}
