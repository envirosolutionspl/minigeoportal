import { useEffect, useRef, useState } from 'react';
import { Layers, LocateFixed, Search, X } from 'lucide-react';
import { fromLonLat } from 'ol/proj';
import { geocode, type GeocodeHit } from '@/services/geocoder';
import { useMapStore } from '@/state/store';
import { BrandMark, Wordmark } from './Brand';
import { useWelcome } from './WelcomeDialog';

const ADDRESS_ZOOM = 13;

export function TopBar() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const flyTo = useMapStore((m) => m.flyTo);
  const panel = useMapStore((m) => m.panel);
  const setPanel = useMapStore((m) => m.setPanel);
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
        setHits(await geocode(q, controller.signal));
        setOpen(true);
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setHits([]);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const pick = (hit: GeocodeHit) => {
    setQuery(hit.label);
    setOpen(false);
    flyTo(hit.center, ADDRESS_ZOOM);
  };

  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const c = fromLonLat([pos.coords.longitude, pos.coords.latitude], 'EPSG:2180');
        flyTo([c[0], c[1]], ADDRESS_ZOOM);
      },
      undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3 sm:p-4">
      <div className="pointer-events-auto relative w-full max-w-lg">
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface)] py-1.5 pr-3 pl-1.5 shadow-lg ring-1 ring-black/5">
          <button
            type="button"
            onClick={() => openWelcome(true)}
            title="O serwisie"
            aria-label="Prosty Geoportal: o serwisie"
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
              if (e.key === 'Enter' && hits[0]) pick(hits[0]);
              if (e.key === 'Escape') setOpen(false);
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder="Adres, miejscowość…"
            aria-label="Szukaj"
            autoComplete="off"
            className="h-7 w-full bg-transparent text-base outline-none placeholder:text-[var(--muted)]"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Wyczyść" className="rounded-full p-1 hover:bg-[var(--hover)]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {open && (hits.length > 0 || busy) && (
          <ul className="absolute inset-x-0 mt-2 overflow-hidden rounded-2xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-black/5">
            {hits.map((h) => (
              <li key={`${h.center[0]},${h.center[1]}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(h)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--hover)]"
                >
                  {h.label}
                </button>
              </li>
            ))}
            {busy && hits.length === 0 && <li className="px-4 py-2 text-sm text-[var(--muted)]">Szukam…</li>}
          </ul>
        )}
      </div>

      <div className="pointer-events-auto ml-auto flex gap-2">
        <IconButton label="Moja lokalizacja" onClick={locate}>
          <LocateFixed className="h-5 w-5" />
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
