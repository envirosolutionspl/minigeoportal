import { Suspense, useEffect, useRef, useState } from 'react';
import {
  Building2,
  Crosshair,
  Ellipsis,
  Fullscreen,
  History,
  Home,
  Info,
  Landmark,
  Layers,
  Link2,
  LoaderCircle,
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
import { searchProvider, type HitKind, type SearchHit } from '@/search';
import { config } from '@/config/runtime';
import { t } from '@/i18n';
import { urlState, useMapStore } from '@/state/store';
import { useInfoStore } from '@/state/info';
import { openPrint } from '@/map/print';
import { linkFor } from '@/state/url';
import { APP_NAME, BrandMark, Wordmark } from './Brand';
import { useWelcome } from './WelcomeDialog';
import { heightsAt, searchTool } from '@/modules';
import { PROJECTION, zoomForScale } from '@/map/projection';
import { DisplayMenu } from './DisplayMenu';
import { useNotice } from './Notice';
import { MoreSheet } from './MoreSheet';
import { NewTab } from './NewTab';

/** Scale per hit kind, unless the hit names its own; points zoom to it, outlines at most to it. */
const SCALE: Record<HitKind, number> = {
  address: 1000,
  street: 1000,
  place: 5000,
  unit: 1000,
  nature: 5000,
  parcel: 1000,
  point: 1000,
};
const ICON: Record<HitKind, LucideIcon> = {
  address: Home,
  street: Route,
  place: Building2,
  unit: Landmark,
  nature: Mountain,
  parcel: SquareDashed,
  point: Crosshair,
};
const provider = searchProvider;
/** A refusal faster than this came without a prompt: the browser no longer asks this site. */
const NO_PROMPT_MS = 600;

export function TopBar() {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  /** Services that did not answer the last search: said under its results. */
  const [unavailable, setUnavailable] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Highlighted hit for arrow keys; -1 means none. */
  const [active, setActive] = useState(-1);
  /** What screen readers hear once a search finishes. */
  const [announce, setAnnounce] = useState('');
  /** The search tool of a module (the parcel search) is open in place of the results. */
  const [toolOpen, setToolOpen] = useState(false);
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
  const toggleTime = () => setTool(tool === 'time' ? 'none' : 'time');
  const toggleProfile = () => setTool(tool === 'profile' ? 'none' : 'profile');
  /** The time view, where map.yaml sets one up. */
  const timeTravel = config.map.timeTravel !== undefined;
  /** Message after copying the link; read out by screen readers. */
  const { say, notice } = useNotice();
  const openWelcome = useWelcome((w) => w.setOpen);
  /** The sheet with the tools phones keep off the map. */
  const [more, setMore] = useState(false);

  const run = async (q: string, controller: AbortController) => {
    setBusy(true);
    try {
      const found = await provider.search(q, controller.signal);
      if (controller.signal.aborted) return;
      setHits(found);
      const missing = found.unavailable?.length ? t('search.unavailable', { services: found.unavailable.join(', ') }) : '';
      setUnavailable(missing);
      setActive(-1);
      setAnnounce(`${found.length ? t('search.results', { count: found.length }) : t('search.none')} ${missing}`.trim());
      setOpen(true);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setHits([]);
    } finally {
      // A newer search owns the spinner now; otherwise this one turns it off.
      if (abort.current === controller) setBusy(false);
    }
  };

  /** Search after Enter, for a provider that does not search while typing. */
  const searchNow = () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    void run(query.trim(), controller);
  };

  useEffect(() => {
    abort.current?.abort();
    if (chosen.current) {
      chosen.current = false;
      return;
    }
    const q = query.trim();
    // A provider that searches after Enter shows no results of an older text.
    if (q.length < 3 || !provider.instant) {
      setHits([]);
      setUnavailable('');
      setAnnounce('');
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    const timer = window.setTimeout(() => void run(q, controller), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Also with no results when a service did not answer: the list says so.
  const listOpen = !toolOpen && open && (hits.length > 0 || busy || Boolean(unavailable));

  const pick = async (hit: SearchHit) => {
    const mine = ++picked.current;
    const text = hit.detail && (hit.kind === 'address' || hit.kind === 'street') ? `${hit.label}, ${hit.detail}` : hit.label;
    // Only a changed text runs the search effect, which then skips this one change.
    chosen.current = text !== query;
    setQuery(text);
    setOpen(false);
    setToolOpen(false);
    const { wkt, persist } = provider.outline ? await provider.outline(hit) : { wkt: hit.wkt, persist: false };
    // A later pick wins, even when its outline arrives first.
    if (mine !== picked.current) return;
    const zoom = zoomForScale(hit.scale ?? SCALE[hit.kind]);
    focusOn(hit.extent && !wkt ? { extent: hit.extent, zoom } : { wkt, center: hit.center, zoom, persist });
  };

  const clear = () => {
    setQuery('');
    clearFocus();
  };

  /** Link to this view with the base map and the layers that are on, ready to paste. */
  const copyLink = async () => {
    const link = linkFor(urlState(useMapStore.getState()));
    try {
      await navigator.clipboard.writeText(link);
      say(t('tools.linkCopied'));
    } catch {
      // No clipboard access (e.g. an insecure page): the link is shown to copy by hand.
      say(link);
    }
  };

  const toggleMeasure = () => setTool(measuring ? 'none' : 'measure-line');
  const togglePrint = () => {
    // The print panel takes the place panel's spot on the left.
    useInfoStore.getState().close();
    if (tool === 'print') setTool('none');
    else openPrint();
  };

  const locate = () => {
    // No geolocation at all (an old browser, a page without https): said, not silently ignored.
    if (!navigator.geolocation) return say(t('tools.locateFailed'));
    const asked = performance.now();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = fromLonLat([pos.coords.longitude, pos.coords.latitude], PROJECTION);
        focusOn({ center: [c[0], c[1]], zoom: zoomForScale(SCALE.point) });
      },
      // Refused: a prompt the visitor answered with "no" or closed is their choice, so nothing is
      // said; a refusal that comes at once means the browser no longer asks (Safari after a
      // dismissed prompt, any browser with the site blocked), so the message says to allow it by hand.
      (error) => {
        if (error.code !== error.PERMISSION_DENIED) return say(t('tools.locateFailed'));
        if (performance.now() - asked < NO_PROMPT_MS) say(t('tools.locateBlocked'));
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    // Above the base map switcher and the credits (z-30), so the open search, its results and the
    // parcel form are never covered on a short screen; the layer list (z-40) still covers it.
    <header className="pointer-events-none absolute inset-x-0 top-0 z-[35] flex items-start gap-2 p-3 sm:p-4">
      <div role="search" className="search-box pointer-events-auto relative z-10 w-full max-w-lg">
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface)] py-1.5 pr-3 pl-1.5 shadow-lg ring-1 ring-black/5 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[var(--accent)]">
          <button
            type="button"
            onClick={goHome}
            title={config.map.view.homeLabel}
            aria-label={t('search.home', { app: APP_NAME })}
            className="flex shrink-0 items-center gap-2 rounded-xl py-0.5 pr-2 pl-0.5 hover:bg-[var(--hover)]"
          >
            <BrandMark />
            <span className="hidden md:inline">
              <Wordmark />
            </span>
          </button>
          <span className="h-6 w-px shrink-0 bg-[var(--hover)]" aria-hidden="true" />
          {/* While a service is asked, the magnifier turns: a slow answer is not taken for none. */}
          {busy ? (
            <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-[var(--accent)]" aria-hidden="true" />
          ) : (
            <Search className="h-5 w-5 shrink-0 text-[var(--muted)]" aria-hidden="true" />
          )}
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
              else if (e.key === 'Enter' && query.trim().length >= 3) searchNow();
              else if (e.key === 'Enter') say(t('search.tooShort'));
              if (e.key === 'Escape' && listOpen) {
                e.stopPropagation();
                setOpen(false);
              }
            }}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder={provider.placeholder}
            aria-label={provider.label}
            autoComplete="off"
            // 16 px on phones keeps iOS from zooming into the field; from sm up it matches the search tool's button and the hits.
            className="h-8 w-full bg-transparent text-base outline-none placeholder:text-[var(--muted)] sm:text-sm"
          />
          {query && (
            <button type="button" onClick={clear} aria-label={t('search.clear')} className="rounded-full p-1 hover:bg-[var(--hover)]">
              <X className="h-4 w-4" />
            </button>
          )}
          {searchTool && (
            <button
              type="button"
              onClick={() => setToolOpen(!toolOpen)}
              aria-expanded={toolOpen}
              title={searchTool.label}
              aria-label={searchTool.label}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1 text-sm transition ${
                toolOpen ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--accent)] hover:bg-[var(--hover)]'
              }`}
            >
              <searchTool.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{searchTool.short}</span>
            </button>
          )}
        </div>
        {searchTool && toolOpen && (
          <Suspense fallback={null}>
            <searchTool.Panel onClose={() => setToolOpen(false)} />
          </Suspense>
        )}
        <ul
          id="search-results"
          role="listbox"
          aria-label={t('search.list')}
          hidden={!listOpen}
          className="absolute inset-x-0 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl bg-[var(--surface)] py-1 shadow-lg ring-1 ring-black/5"
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
              {t('search.busy')}
            </li>
          )}
          {unavailable && !busy && (
            <li role="presentation" className="px-4 py-2 text-xs text-[var(--danger)]">
              {unavailable}
            </li>
          )}
          {provider.credit && hits.length > 0 && (
            <li role="presentation" className="px-4 pt-1 pb-1.5 text-right text-xs text-[var(--muted)]">
              <a href={provider.credit.href} target="_blank" rel="noopener" className="underline-offset-2 hover:underline">
                {provider.credit.text}
                <NewTab />
              </a>
            </li>
          )}
        </ul>
        <p role="status" className="sr-only">
          {toolOpen ? '' : busy ? t('search.busy') : announce}
        </p>
      </div>

      {/* One column on every screen, under the search bar on phones, so the tools never change shape. */}
      {/* Most used first: layers, then working on the map, sharing, and help at the bottom. */}
      <div className="map-tools pointer-events-auto absolute top-[4.25rem] right-3 flex flex-col gap-2 sm:top-4 sm:right-4">
        <IconButton
          label={t('tools.layers')}
          active={panel === 'catalog'}
          onClick={() => setPanel(panel === 'catalog' ? 'none' : 'catalog')}
        >
          <Layers className="h-5 w-5" />
        </IconButton>
        <IconButton label={t('tools.locate')} onClick={locate}>
          <LocateFixed className="h-5 w-5" />
        </IconButton>
        {/* Phones show only the two tools above and this one; the rest is in its sheet. */}
        <div className="hidden phone:block">
          <IconButton label={t('tools.more')} expanded={more} onClick={() => setMore(true)}>
            <Ellipsis className="h-5 w-5" />
          </IconButton>
        </div>
        <IconButton className="phone:hidden" label={t('tools.measure')} active={measuring} onClick={toggleMeasure}>
          <Ruler className="h-5 w-5" />
        </IconButton>
        {heightsAt && (
          <IconButton className="phone:hidden" label={t('tools.profile')} active={tool === 'profile'} onClick={toggleProfile}>
            <Mountain className="h-5 w-5" />
          </IconButton>
        )}
        {timeTravel && (
          <IconButton className="phone:hidden" label={t('time.tool')} active={tool === 'time'} onClick={toggleTime}>
            <History className="h-5 w-5" />
          </IconButton>
        )}
        <IconButton className="phone:hidden" label={t('tools.link')} onClick={() => void copyLink()}>
          <Link2 className="h-5 w-5" />
        </IconButton>
        <IconButton className="phone:hidden" label={t('tools.print')} active={tool === 'print'} onClick={togglePrint}>
          <Printer className="h-5 w-5" />
        </IconButton>
        <DisplayMenu className="phone:hidden" />
        <IconButton className="phone:hidden" label={t('tools.about')} onClick={() => openWelcome(true)}>
          <Info className="h-5 w-5" />
        </IconButton>
      </div>
      <MoreSheet
        open={more}
        onClose={() => setMore(false)}
        items={[
          ...(timeTravel ? [{ label: t('time.tool'), icon: History, active: tool === 'time', onClick: toggleTime }] : []),
          { label: t('tools.measure'), icon: Ruler, active: measuring, onClick: toggleMeasure },
          ...(heightsAt ? [{ label: t('tools.profile'), icon: Mountain, active: tool === 'profile', onClick: toggleProfile }] : []),
          { label: t('tools.link'), icon: Link2, onClick: () => void copyLink() },
          // No printing on a phone: the printed frame and the paper cannot be set well on its screen.
          { label: config.map.view.homeLabel, icon: Fullscreen, onClick: goHome },
          { label: t('tools.about'), icon: Info, onClick: () => openWelcome(true) },
        ]}
      />
      {notice}
    </header>
  );
}

function IconButton({
  label,
  active,
  expanded,
  className = '',
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  /** For a button that opens a sheet or menu. */
  expanded?: boolean;
  className?: string;
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
      aria-expanded={expanded}
      className={`${className} flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg ring-1 ring-black/5 transition ${
        active ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--surface)] hover:bg-[var(--hover)]'
      }`}
    >
      {children}
    </button>
  );
}
