import { useEffect, useRef, useState } from 'react';
import { Building2, Home, Info, Layers, LocateFixed, Route, Ruler, Search, SquareDashed, X, type LucideIcon } from 'lucide-react';
import { fromLonLat } from 'ol/proj';
import { buildingAt, placeOutline, search, type HitKind, type SearchHit } from '@/services/geocoder';
import { useMapStore } from '@/state/store';
import { BrandMark, Wordmark } from './Brand';
import { useWelcome } from './WelcomeDialog';
import { ParcelSearch } from './ParcelSearch';

/** Closest zoom per hit kind on the GUGiK scale series (13 = 1:1890, 14 = 1:945, 15 = 1:472). */
const ZOOM: Record<HitKind, number> = { address: 14, street: 14, place: 12, parcel: 15 };
const ICON: Record<HitKind, LucideIcon> = { address: Home, street: Route, place: Building2, parcel: SquareDashed };
const OUTLINE_TIMEOUT_MS = 2500;

export function TopBar() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [parcelOpen, setParcelOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const focusOn = useMapStore((m) => m.focusOn);
  const clearFocus = useMapStore((m) => m.clearFocus);
  const goHome = useMapStore((m) => m.goHome);
  const panel = useMapStore((m) => m.panel);
  const setPanel = useMapStore((m) => m.setPanel);
  const tool = useMapStore((m) => m.tool);
  const setTool = useMapStore((m) => m.setTool);
  const openWelcome = useWelcome((w) => w.setOpen);

  useEffect(() => {
    abort.current?.abort();
    const q = query.trim();
    if (q.length < 3) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        setHits(await search(q, controller.signal));
        setOpen(true);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setHits([]);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const pick = async (hit: SearchHit) => {
    setQuery(hit.detail && (hit.kind === 'address' || hit.kind === 'street') ? `${hit.label}, ${hit.detail}` : hit.label);
    setOpen(false);
    setParcelOpen(false);
    let wkt = hit.wkt;
    let persist = hit.kind === 'parcel';
    // Places and addresses come as points; their outline (town boundary, building) is looked up
    // separately, without delaying the map for long.
    const signal = AbortSignal.timeout(OUTLINE_TIMEOUT_MS);
    if (hit.kind === 'place') wkt = await placeOutline(hit, signal).catch(() => undefined);
    if (hit.kind === 'address' && hit.center) {
      const building = await buildingAt(hit.center, signal).catch(() => undefined);
      if (building) {
        wkt = building;
        persist = true;
      }
    }
    focusOn({ wkt, center: hit.center, zoom: ZOOM[hit.kind], persist });
  };

  const clear = () => {
    setQuery('');
    clearFocus();
  };

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const c = fromLonLat([pos.coords.longitude, pos.coords.latitude], 'EPSG:2180');
        focusOn({ center: [c[0], c[1]], zoom: ZOOM.address });
      },
      undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start gap-2 p-3 sm:p-4">
      <div className="pointer-events-auto relative w-full max-w-lg">
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface)] py-1.5 pr-3 pl-1.5 shadow-lg ring-1 ring-black/5">
          <button
            type="button"
            onClick={goHome}
            title="Cała Polska"
            aria-label="Prosty Geoportal: pokaż całą Polskę"
            className="flex shrink-0 items-center gap-2 rounded-xl py-0.5 pr-2 pl-0.5 hover:bg-[var(--hover)]"
          >
            <BrandMark />
            <span className="hidden md:inline">
              <Wordmark />
            </span>
          </button>
          <span className="h-6 w-px shrink-0 bg-[var(--hover)]" aria-hidden="true" />
          <Search className="h-5 w-5 shrink-0 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => hits.length > 0 && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hits[0]) void pick(hits[0]);
              if (e.key === 'Escape') setOpen(false);
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder="Adres, miejscowość, działka…"
            aria-label="Szukaj"
            autoComplete="off"
            className="h-7 w-full bg-transparent text-base outline-none placeholder:text-[var(--muted)]"
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
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1 text-sm transition ${
              parcelOpen ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--accent)] hover:bg-[var(--hover)]'
            }`}
          >
            <SquareDashed className="h-4 w-4" />
            <span className="hidden sm:inline">Działka</span>
          </button>
        </div>
        {parcelOpen && <ParcelSearch onClose={() => setParcelOpen(false)} />}
        {!parcelOpen && open && (hits.length > 0 || busy) && (
          <ul className="absolute inset-x-0 mt-2 overflow-hidden rounded-2xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-black/5">
            {hits.map((h, i) => {
              const Icon = ICON[h.kind];
              return (
                <li key={`${i}-${h.label}-${h.detail ?? ''}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void pick(h)}
                    className="flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-[var(--hover)]"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                    <span className="min-w-0">
                      <span className="block text-sm">{h.label}</span>
                      {h.detail && <span className="block truncate text-xs text-[var(--muted)]">{h.detail}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {busy && hits.length === 0 && <li className="px-4 py-2 text-sm text-[var(--muted)]">Szukam…</li>}
          </ul>
        )}
      </div>

      {/* On phones the buttons form a column under the search bar, leaving it the full width. */}
      <div className="pointer-events-auto ml-auto flex gap-2 max-sm:absolute max-sm:top-[4.25rem] max-sm:right-3 max-sm:flex-col">
        <IconButton label="O serwisie" onClick={() => openWelcome(true)}>
          <Info className="h-5 w-5" />
        </IconButton>
        <IconButton label="Moja lokalizacja" onClick={locate}>
          <LocateFixed className="h-5 w-5" />
        </IconButton>
        <IconButton label="Pomiar odległości i powierzchni" active={tool !== 'none'} onClick={() => setTool(tool === 'none' ? 'measure-line' : 'none')}>
          <Ruler className="h-5 w-5" />
        </IconButton>
        <IconButton label="Warstwy" active={panel === 'catalog'} onClick={() => setPanel(panel === 'catalog' ? 'none' : 'catalog')}>
          <Layers className="h-5 w-5" />
        </IconButton>
      </div>
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
