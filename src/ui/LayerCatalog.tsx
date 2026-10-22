import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ExternalLink, HelpCircle, LoaderCircle, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { config, type Overlay, type SubLayer } from '@/config/runtime';
import { layerMeta, serviceError, visibleAtScale } from '@/services/meta';
import { normalize } from '@/services/text';
import { statusOf, useStatusStore, type ServiceStatus } from '@/services/status';
import { loadCatalogLayer, useCatalog } from '@/services/catalog';
import type { CatalogIndexEntry, CatalogStatus } from '@/services/catalogTypes';
import { overlayOpacity, useMapStore } from '@/state/store';
import { dateText } from '@/services/ortho';
import { scaleText } from '@/map/format';

const STATUS_LABEL: Record<ServiceStatus, string> = {
  unknown: 'Jeszcze nie wczytywana',
  ok: 'Dostępna',
  blocked: 'Niedostępna u nas',
  down: 'Usługa nie odpowiada',
  degraded: 'Część danych nie ładuje się w tym miejscu',
};

/** Brand book palette: clover for ok, amber and raspberry from the additional colours for problems. */
const STATUS_DOT: Record<ServiceStatus, string> = {
  unknown: 'bg-[#9db49e]',
  ok: 'bg-[#7da87f]',
  blocked: 'bg-[#9db49e]',
  down: 'bg-[#D25F87]',
  degraded: 'bg-[#FFBC42]',
};

/** Why a layer cannot be shown, in plain language, by the result of the last check. */
const WHY: Record<Exclude<CatalogStatus, 'ok'> | 'degraded', string> = {
  token: 'Usługa wymaga tokenu, który GUGiK wydaje tylko aplikacji geoportal.gov.pl.',
  refused: 'Serwer tej usługi odrzuca zapytania spoza geoportal.gov.pl.',
  down: 'Serwer usługi nie odpowiadał przy ostatnim sprawdzeniu. Sprawdzimy go ponownie przy kolejnym odświeżeniu listy warstw.',
  unsupported: `Usługa nie podaje mapy w układzie ${config.map.projection.name} (${config.map.projection.code}), a tylko w nim rysujemy, żeby mapa była szybka.`,
  degraded: 'Usługa kieruje do serwera powiatu lub gminy, który w tym miejscu nie odpowiada albo odrzuca zapytania.',
};

/** Shown at once for a long topic; the rest after "Pokaż więcej". */
const PAGE = 60;

/** Words of the query that every match must contain, ignoring case and Polish diacritics. */
function words(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

function textMatches(text: string, q: string[]): boolean {
  const hay = normalize(text);
  return q.every((w) => hay.includes(w));
}

const TOPICS = config.layers.topics;
const TOPIC_TITLE = new Map(TOPICS.map((t) => [t.id, t.title]));
/** Where to see a layer that does not work here. */
const FALLBACK = config.links.fallbackMap;

function serviceText(s: Overlay): string {
  return [s.title, s.description, ...s.keywords, TOPIC_TITLE.get(s.topic)].join(' ');
}

const entryText = (e: CatalogIndexEntry) => [e.title, ...e.path, TOPIC_TITLE.get(e.topic)].join(' ');

/** Available layers first, then by title. */
const byAvailability = (a: CatalogIndexEntry, b: CatalogIndexEntry) =>
  Number(a.status !== 'ok') - Number(b.status !== 'ok') || a.title.localeCompare(b.title, 'pl');

export function LayerCatalog() {
  const close = useMapStore((m) => m.setPanel);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  /** Only the layers switched on: a short list to adjust what is on the map. */
  const [onlyActive, setOnlyActive] = useState(false);
  const active = useMapStore((m) => m.overlays);
  // Typing stays quick: the list filters after the keystroke is shown.
  const deferred = useDeferredValue(query);
  const q = useMemo(() => words(deferred), [deferred]);
  const catalogState = useCatalog((c) => c.state);
  const entries = useCatalog((c) => c.entries);
  const panel = useMapStore((m) => m.panel);

  // The geoportal list (gugik module) loads when the panel is first opened; our own layers work without it.
  useEffect(() => {
    if (panel === 'catalog' && config.modules.gugik?.catalog) void useCatalog.getState().load();
  }, [panel]);

  /** Search text of every geoportal layer, normalized once instead of on each keystroke. */
  const texts = useMemo(() => new Map(entries.map((e) => [e.id, normalize(entryText(e))])), [entries]);

  /** Our services matching the filter; matching sublayers open the service with those rows highlighted. */
  const results = useMemo(
    () =>
      config.layers.overlays
        .filter((s) => (topic === null || s.topic === topic) && (!onlyActive || active.includes(s.id)))
        .map((s) => {
          if (q.length === 0) return { s, hits: [] as string[] };
          const hits = s.sublayers.filter((l) => textMatches(l.title, q)).map((l) => l.name);
          return hits.length > 0 || textMatches(serviceText(s), q) ? { s, hits } : null;
        })
        .filter((r): r is { s: Overlay; hits: string[] } => r !== null),
    [q, topic, onlyActive, active],
  );

  /** Geoportal layers that our own entries do not already show. */
  const others = useMemo(
    () =>
      entries
        .filter(
          (e) =>
            !e.curated &&
            (topic === null || e.topic === topic) &&
            (!onlyActive || active.includes(e.id)) &&
            (q.length === 0 || q.every((w) => texts.get(e.id)?.includes(w))),
        )
        .sort(byAvailability),
    [entries, texts, q, topic, onlyActive, active],
  );

  const filtering = q.length > 0 || topic !== null || onlyActive;
  const starters = results.filter((r) => r.s.starter);

  return (
    <section className="flex h-full flex-col" aria-label="Katalog warstw">
      <header className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h2 className="flex-1 text-base font-semibold">Warstwy</h2>
        <button type="button" onClick={() => close('none')} aria-label="Zamknij" className="rounded-full p-2 hover:bg-[var(--hover)]">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="px-4 pb-2">
        <label className="flex items-center gap-2 rounded-xl bg-[var(--field)] px-3 py-2 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[var(--accent)]">
          <Search className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
          <input
            type="search"
            aria-label="Szukaj warstwy"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj warstwy: woda, gaz, plan, zabytki…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Wyczyść wyszukiwanie"
              className="rounded-full p-1 hover:bg-[var(--hover)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setOnlyActive(!onlyActive)}
            aria-pressed={onlyActive}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-[var(--accent)] transition ${
              onlyActive ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--accent)] hover:bg-[var(--hover)]'
            }`}
          >
            {onlyActive && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            Tylko włączone ({active.length})
          </button>
          {TOPICS.map(({ id: t, title }) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(topic === t ? null : t)}
              aria-pressed={topic === t}
              className={`rounded-full px-3 py-1 text-xs transition ${
                topic === t ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--field)] hover:bg-[var(--hover)]'
              }`}
            >
              {title}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {filtering ? (
          <Group title={onlyActive && q.length === 0 && topic === null ? 'Włączone warstwy' : 'Wyniki'}>
            {results.map(({ s, hits }) => (
              <OverlayItem key={s.id} s={s} hits={hits} />
            ))}
            <CatalogList entries={others} />
            {results.length === 0 && others.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">
                {onlyActive && active.length === 0 ? 'Żadna warstwa nie jest włączona.' : 'Brak warstw dla tego filtru.'}
              </p>
            )}
          </Group>
        ) : (
          <>
            <Group title="Najpopularniejsze">
              {starters.map(({ s, hits }) => (
                <OverlayItem key={s.id} s={s} hits={hits} />
              ))}
            </Group>
            <Group title="Wszystkie warstwy">
              {TOPICS.map(({ id: t }) => (
                <TopicSection
                  key={t}
                  topic={t}
                  own={results.filter((r) => !r.s.starter && r.s.topic === t).map((r) => r.s)}
                  entries={others.filter((e) => e.topic === t)}
                />
              ))}
            </Group>
          </>
        )}
        <CatalogNotice state={catalogState} />
      </div>
    </section>
  );
}

function CatalogNotice({ state }: { state: string }) {
  if (state === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--muted)]">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Wczytuję listę warstw geoportal.gov.pl…
      </p>
    );
  }
  if (state === 'preparing' || state === 'error') {
    return (
      <p role="status" className="px-3 py-2 text-xs text-[var(--muted)]">
        {state === 'preparing'
          ? 'Lista wszystkich warstw geoportal.gov.pl jest w przygotowaniu. Spróbuj za kilka minut.'
          : 'Nie udało się wczytać listy warstw geoportal.gov.pl. Warstwy powyżej działają.'}
      </p>
    );
  }
  return null;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h3>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

/** One topic of the full list, closed until opened: it can hold dozens of layers. */
function TopicSection({ topic, own, entries }: { topic: string; own: Overlay[]; entries: CatalogIndexEntry[] }) {
  const [open, setOpen] = useState(false);
  const count = own.length + entries.length;
  if (count === 0) return null;
  const available = own.length + entries.filter((e) => e.status === 'ok').length;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium hover:bg-[var(--hover)]"
      >
        <span className="flex-1">{TOPIC_TITLE.get(topic)}</span>
        <span className="text-xs font-normal text-[var(--muted)]" title={`${available} dostępnych z ${count}`}>
          {available === count ? count : `${available} z ${count}`}
        </span>
        <ChevronDown className={`h-4 w-4 text-[var(--muted)] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="ml-2 flex flex-col gap-0.5 border-l border-[var(--hover)] pl-1">
          {own.map((s) => (
            <OverlayItem key={s.id} s={s} hits={[]} />
          ))}
          <CatalogList entries={entries} />
        </div>
      )}
    </div>
  );
}

function CatalogList({ entries }: { entries: CatalogIndexEntry[] }) {
  const [shown, setShown] = useState(PAGE);
  return (
    <>
      {entries.slice(0, shown).map((e) => (
        <CatalogItem key={e.id} entry={e} />
      ))}
      {entries.length > shown && (
        <button
          type="button"
          onClick={() => setShown(shown + PAGE)}
          className="min-h-9 rounded-xl px-3 text-left text-xs text-[var(--accent)] hover:bg-[var(--hover)]"
        >
          Pokaż więcej ({entries.length - shown})
        </button>
      )}
    </>
  );
}

/**
 * A layer of the geoportal catalog. Once switched on or unfolded, its definition loads and it
 * behaves like our own layers: sublayers can be chosen before it is switched on, as a whole
 * service can be too much at once. Layers we cannot show stay in their topic, greyed out.
 */
function CatalogItem({ entry }: { entry: CatalogIndexEntry }) {
  const def = useCatalog((c) => c.defs.get(entry.id));
  const failed = useCatalog((c) => c.failed.has(entry.id));
  const active = useMapStore((m) => m.overlays.includes(entry.id));
  const toggle = useMapStore((m) => m.toggleOverlay);
  const [expanded, setExpanded] = useState(false);
  if (def) return <OverlayItem s={def} hits={[]} startOpen={expanded} />;
  const available = entry.status === 'ok';
  const expand = () => {
    if (!expanded) void loadCatalogLayer(entry.id);
    setExpanded(!expanded);
  };
  const checkedOn = dateText(entry.checked.slice(0, 10));

  return (
    <div className={`rounded-xl px-3 py-2 ${active ? 'bg-[var(--accent-soft)]' : ''}`}>
      <div className={`flex items-start gap-3 ${available ? '' : 'opacity-60'}`}>
        <input
          id={`gp-${entry.id}`}
          type="checkbox"
          checked={active}
          disabled={!available}
          onChange={() => toggle(entry.id)}
          aria-label={entry.title}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
        />
        <label htmlFor={`gp-${entry.id}`} className={`min-w-0 flex-1 ${available ? 'cursor-pointer' : ''}`}>
          <span className="block text-sm font-medium">{entry.title}</span>
          {entry.path.length > 0 && <span className="block text-xs text-[var(--muted)]">{entry.path.join(' › ')}</span>}
          {(active || expanded) && !failed && (
            <span className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" /> {active ? 'Wczytuję warstwę…' : 'Wczytuję podwarstwy…'}
            </span>
          )}
        </label>
        {available && (entry.parts ?? 0) > 1 && (
          <button
            type="button"
            onClick={expand}
            aria-expanded={expanded}
            aria-label={`Warstwy usługi: ${entry.title}`}
            className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--hover)]"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {!available && <Why status={entry.status as Exclude<CatalogStatus, 'ok'>} detail={entry.detail} checked={checkedOn} />}
      {available && failed && (
        <p role="status" className="mt-1 ml-7 text-xs text-[var(--danger)]">
          Nie udało się wczytać tej warstwy. Spróbuj później
          {FALLBACK && (
            <>
              {' '}
              albo zobacz ją w{' '}
              <a href={FALLBACK} target="_blank" rel="noopener" className="underline">
                geoportal.gov.pl
              </a>
            </>
          )}
          .
        </p>
      )}
    </div>
  );
}

/** "Dlaczego niedostępna?": the reason in plain words, what the server answered, and a link. */
function Why({ status, detail, checked }: { status: keyof typeof WHY; detail?: string; checked?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 ml-7">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex min-h-6 items-center gap-1 text-xs text-[var(--accent)] underline-offset-2 hover:underline"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        {status === 'degraded' ? 'Dlaczego dane się nie wczytują?' : 'Niedostępna u nas. Dlaczego?'}
      </button>
      {open && (
        <div className="mt-1 rounded-lg bg-[var(--field)] px-3 py-2 text-xs leading-relaxed">
          <p>{WHY[status]}</p>
          {(detail || checked) && (
            <p className="mt-1 text-[var(--muted)]">
              {detail && <>Odpowiedź serwera: {detail}. </>}
              {checked && <>Sprawdzono {checked}.</>}
            </p>
          )}
          {FALLBACK && (
            <a href={FALLBACK} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 text-[var(--accent)]">
              Zobacz w geoportal.gov.pl <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: ServiceStatus }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`}
      title={STATUS_LABEL[status]}
      role="img"
      aria-label={STATUS_LABEL[status]}
    />
  );
}

function OverlayItem({ s, hits, startOpen = false }: { s: Overlay; hits: string[]; startOpen?: boolean }) {
  const active = useMapStore((m) => m.overlays.includes(s.id));
  const toggle = useMapStore((m) => m.toggleOverlay);
  const opacity = useMapStore((m) => overlayOpacity(s.id, m.opacity));
  const setOpacity = useMapStore((m) => m.setOpacity);
  const status = useStatusStore((st) => statusOf(st.status, s.id));
  const [expanded, setExpanded] = useState(startOpen);
  const blocked = status === 'blocked';
  const open = expanded || hits.length > 0;

  return (
    <div className={`rounded-xl px-3 py-2 ${active ? 'bg-[var(--accent-soft)]' : ''}`}>
      <div className={`flex items-start gap-3 ${blocked ? 'opacity-60' : ''}`}>
        <input
          id={`ov-${s.id}`}
          type="checkbox"
          checked={active}
          disabled={blocked}
          onChange={() => toggle(s.id)}
          aria-label={s.title}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
        />
        <label htmlFor={`ov-${s.id}`} className="min-w-0 flex-1 cursor-pointer">
          <span className="flex items-center gap-2 text-sm font-medium">
            {s.title}
            <StatusDot status={status} />
          </span>
          <span className="block text-xs text-[var(--muted)]">{s.description}</span>
        </label>
        {s.sublayers.length > 1 && (
          <button
            type="button"
            onClick={() => setExpanded(!open)}
            aria-expanded={open}
            aria-label={`Warstwy usługi: ${s.title}`}
            className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--hover)]"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {(status === 'blocked' || status === 'down' || status === 'degraded') && (
        <Why status={status === 'blocked' ? 'refused' : status} detail={serviceError(s.id)} />
      )}

      {open && s.sublayers.length > 1 && (
        // Services with dozens of layers scroll within their own box.
        <ul className={`mt-2 ml-7 flex flex-col gap-1 ${s.sublayers.length > 12 ? 'max-h-80 overflow-y-auto pr-1' : ''}`}>
          {s.sublayers.map((l) => (
            <SublayerRow key={l.name} s={s} l={l} highlighted={hits.includes(l.name)} disabled={blocked} />
          ))}
        </ul>
      )}

      {active && (
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          aria-label={`Przezroczystość: ${s.title}`}
          onChange={(e) => setOpacity(s.id, Number(e.target.value))}
          className="mt-1 ml-7 h-6 w-[calc(100%-1.75rem)] cursor-pointer accent-[var(--accent)]"
        />
      )}
    </div>
  );
}

function SublayerRow({ s, l, highlighted, disabled }: { s: Overlay; l: SubLayer; highlighted: boolean; disabled: boolean }) {
  const on = useMapStore((m) => m.overlays.includes(s.id));
  const chosen = useMapStore((m) => m.sublayers[s.id]);
  const checked = on && (chosen ? chosen.includes(l.name) : Boolean(l.default));
  const toggle = useMapStore((m) => m.toggleSublayer);
  const zoomToScale = useMapStore((m) => m.zoomToScale);
  const outOfScale = useMapStore((m) => !visibleAtScale(s.id, l.name, m.scale));
  const meta = layerMeta(s.id, l.name);
  const zoomedOutTooFar = useMapStore((m) => outOfScale && meta?.maxScale !== undefined && m.scale > meta.maxScale);
  /** Scale the map should go to for the layer to appear: just inside its visible range. */
  const targetScale = zoomedOutTooFar ? (meta?.maxScale ?? 0) * 0.9 : (meta?.minScale ?? 0) * 1.1;
  const hint = zoomedOutTooFar
    ? `Widoczne od skali ${scaleText(meta?.maxScale ?? 0)}`
    : `Widoczne do skali ${scaleText(meta?.minScale ?? 0)}`;
  return (
    <li className={`flex items-center gap-1 rounded-lg text-sm ${highlighted ? 'bg-[var(--field)] font-medium' : ''}`}>
      <label className="flex min-h-8 flex-1 cursor-pointer items-center gap-2 px-1.5 py-1">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => toggle(s.id, l.name)}
          aria-label={`${s.title}: ${l.title}`}
          className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
        />
        {/* Greyed while the server does not draw it at this scale; the hint says from which scale it does. */}
        <span className={outOfScale ? 'text-[var(--muted)]' : ''} title={outOfScale ? `${hint}. Teraz niewidoczne.` : undefined}>
          {l.title}
        </span>
      </label>
      {checked && outOfScale && (
        // Outside the label, so a click next to it cannot switch the layer off.
        <button
          type="button"
          onClick={() => zoomToScale(targetScale)}
          title={hint}
          aria-label={`${zoomedOutTooFar ? 'Przybliż' : 'Oddal'} mapę do warstwy ${l.title}. ${hint}`}
          className="flex min-h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-[var(--accent)] hover:bg-[var(--hover)]"
        >
          {zoomedOutTooFar ? <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> : <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />}
          {zoomedOutTooFar ? 'przybliż' : 'oddal'}
        </button>
      )}
    </li>
  );
}
