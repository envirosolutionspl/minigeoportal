import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  CircleOff,
  ExternalLink,
  HelpCircle,
  LoaderCircle,
  Search,
  TriangleAlert,
  Hourglass,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import { config, type Overlay, type SubLayer } from '@/config/runtime';
import { layerMeta, serviceError, visibleAtScale } from '@/services/meta';
import { normalize } from '@/services/text';
import { statusOf, useStatusStore, type ServiceStatus } from '@/services/status';
import { loadCatalogLayer, useCatalog, type LoadState } from '@/services/catalog';
import type { CatalogIndexEntry, CatalogStatus } from '@/services/catalogTypes';
import { overlayOpacity, useMapStore } from '@/state/store';
import { dateText, scaleText } from '@/map/format';
import { t } from '@/i18n';
import { NewTab } from './NewTab';

const statusLabel = (status: ServiceStatus) => t(`layers.status.${status}`);

/**
 * Problems of a service by shape and name, not colour alone (WCAG 1.4.1): a crossed circle or a
 * warning. A service that works, or has not been loaded yet, has a dot in the accent colour.
 */
const STATUS_ICON: Partial<Record<ServiceStatus, [LucideIcon, string]>> = {
  blocked: [CircleOff, 'text-[var(--muted)]'],
  down: [CircleOff, 'text-[var(--danger)]'],
  degraded: [TriangleAlert, 'text-[var(--danger)]'],
  slow: [Hourglass, 'text-[var(--accent)]'],
};

/** Why a layer cannot be shown, in plain language, by the result of the last check. */
type WhyStatus = Exclude<CatalogStatus, 'ok'> | 'degraded' | 'slow';
const why = (status: WhyStatus) => t(`layers.why.${status}`, { system: config.map.projection.name, code: config.map.projection.code });

/** Shown at once for a long topic; the rest after "show more". */
const PAGE = 60;

/** Words of the query that every match must contain, ignoring case and Polish diacritics. */
function words(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/** Whether a normalized text has every word of the query; none for a text that is not known. */
const textMatches = (text: string | undefined, q: string[]) => text !== undefined && q.every((w) => text.includes(w));

const TOPICS = config.layers.topics;
const TOPIC_TITLE = new Map(TOPICS.map((t) => [t.id, t.title]));
/** Where to see a layer that does not work here. */
const FALLBACK = config.links.fallbackMap;

function serviceText(s: Overlay): string {
  return [s.title, s.description, ...s.keywords, TOPIC_TITLE.get(s.topic)].join(' ');
}

/** Search text of our own services and of their sublayers (by "service/sublayer"), normalized once, not on each keystroke. */
const OVERLAY_TEXT = new Map(config.layers.overlays.map((s) => [s.id, normalize(serviceText(s))]));
const SUBLAYER_TEXT = new Map(config.layers.overlays.flatMap((s) => s.sublayers.map((l) => [`${s.id}/${l.name}`, normalize(l.title)])));

const entryText = (e: CatalogIndexEntry) => [e.title, ...e.path, TOPIC_TITLE.get(e.topic)].join(' ');

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
  const heading = useRef<HTMLHeadingElement>(null);

  // The geoportal list (gugik module) loads when the panel is first opened; our own layers work without it.
  // Focus goes to the heading, so keyboards and screen readers are in the panel: not to the search
  // field, which would raise the phone's keyboard over the list. Without scrolling: the panel is
  // still sliding in from below the screen, and the browser would scroll the app's box (hidden
  // overflow scrolls too) to bring the heading in, leaving the list at half the screen.
  useEffect(() => {
    if (panel !== 'catalog') return;
    if (config.modules.gugik?.catalog) void useCatalog.getState().load();
    heading.current?.focus({ preventScroll: true });
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
          const hits = s.sublayers.filter((l) => textMatches(SUBLAYER_TEXT.get(`${s.id}/${l.name}`), q)).map((l) => l.name);
          return hits.length > 0 || textMatches(OVERLAY_TEXT.get(s.id), q) ? { s, hits } : null;
        })
        .filter((r): r is { s: Overlay; hits: string[] } => r !== null),
    [q, topic, onlyActive, active],
  );

  /** Geoportal layers that our own entries do not already show, in the order the list came in (available first, then by title). */
  const others = useMemo(
    () =>
      entries.filter(
        (e) =>
          !e.curated &&
          (topic === null || e.topic === topic) &&
          (!onlyActive || active.includes(e.id)) &&
          (q.length === 0 || textMatches(texts.get(e.id), q)),
      ),
    [entries, texts, q, topic, onlyActive, active],
  );

  const filtering = q.length > 0 || topic !== null || onlyActive;
  const starters = results.filter((r) => r.s.starter);

  return (
    <section className="flex h-full flex-col" aria-label={t('layers.panel')}>
      <header className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h2 ref={heading} tabIndex={-1} className="flex-1 text-base font-semibold">
          {t('layers.title')}
        </h2>
        <button
          type="button"
          onClick={() => close('none')}
          aria-label={t('common.close')}
          className="flex items-center justify-center rounded-full p-2 hover:bg-[var(--hover)] phone:h-11 phone:w-11"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="px-4 pb-2">
        <label className="flex items-center gap-2 rounded-xl bg-[var(--field)] px-3 py-2 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[var(--accent)]">
          <Search className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
          <input
            type="search"
            aria-label={t('layers.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('layers.searchPlaceholder')}
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('layers.clearSearch')}
              className="rounded-full p-1 hover:bg-[var(--hover)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        {/* On a phone the filters form one row that scrolls sideways, so the list keeps the screen;
            the row fades out at its right edge, which says there is more. */}
        <div className="mt-2 flex flex-wrap gap-1.5 phone:-mx-4 phone:flex-nowrap phone:overflow-x-auto phone:px-4 phone:[scrollbar-width:none] phone:[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] phone:[&>*]:shrink-0 phone:[&>*]:whitespace-nowrap phone:[&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setOnlyActive(!onlyActive)}
            aria-pressed={onlyActive}
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-[var(--accent)] transition phone:py-2 ${
              onlyActive ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'text-[var(--accent)] hover:bg-[var(--hover)]'
            }`}
          >
            {onlyActive && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            {t('layers.onlyActive', { count: active.length })}
          </button>
          {TOPICS.map(({ id, title }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTopic(topic === id ? null : id)}
              aria-pressed={topic === id}
              className={`rounded-full px-3 py-1 text-xs transition phone:py-2 ${
                topic === id ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--field)] hover:bg-[var(--hover)]'
              }`}
            >
              {title}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {filtering ? (
          <Group title={onlyActive && q.length === 0 && topic === null ? t('layers.activeGroup') : t('layers.results')}>
            {results.map(({ s, hits }) => (
              <OverlayItem key={s.id} s={s} hits={hits} />
            ))}
            <CatalogList entries={others} />
            {results.length === 0 && others.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">
                {onlyActive && active.length === 0 ? t('layers.noneActive') : t('layers.noneFound')}
              </p>
            )}
          </Group>
        ) : (
          <>
            <Group title={t('layers.popular')}>
              {starters.map(({ s, hits }) => (
                <OverlayItem key={s.id} s={s} hits={hits} />
              ))}
            </Group>
            <Group title={t('layers.all')}>
              {TOPICS.map(({ id }) => (
                <TopicSection
                  key={id}
                  topic={id}
                  own={results.filter((r) => !r.s.starter && r.s.topic === id).map((r) => r.s)}
                  entries={others.filter((e) => e.topic === id)}
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

function CatalogNotice({ state }: { state: LoadState }) {
  if (state === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 px-3 py-2 text-xs text-[var(--muted)]">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t('layers.catalogLoading')}
      </p>
    );
  }
  if (state === 'preparing' || state === 'error') {
    return (
      <p role="status" className="px-3 py-2 text-xs text-[var(--muted)]">
        {state === 'preparing' ? t('layers.catalogPreparing') : t('layers.catalogError')}
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
        <span className="text-xs font-normal text-[var(--muted)]" title={t('layers.available', { available, count })}>
          {available === count ? count : t('layers.availableShort', { available, count })}
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
          {t('layers.more', { count: entries.length - shown })}
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
    <LayerRow
      id={`gp-${entry.id}`}
      title={entry.title}
      subtitle={entry.path.length > 0 ? entry.path.join(' › ') : undefined}
      active={active}
      disabled={!available}
      expandable={available && (entry.parts ?? 0) > 1}
      expanded={expanded}
      onToggle={() => toggle(entry.id)}
      onExpand={expand}
    >
      {(active || expanded) && !failed && (
        <p className="mt-1 ml-7 flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />{' '}
          {active ? t('layers.loadingLayer') : t('layers.loadingSublayers')}
        </p>
      )}
      {entry.status !== 'ok' && <Why status={entry.status} detail={entry.detail} checked={checkedOn} />}
      {available && failed && (
        <p role="status" className="mt-1 ml-7 text-xs text-[var(--danger)]">
          {t('layers.failed')}
          {FALLBACK && (
            <>
              {' '}
              {t('layers.failedFallback')}{' '}
              <a href={FALLBACK.url} target="_blank" rel="noopener" className="underline">
                {FALLBACK.name}
                <NewTab />
              </a>
            </>
          )}
          .
        </p>
      )}
    </LayerRow>
  );
}

/**
 * The row of one layer, ours or the geoportal's: a checkbox, its title and subtitle, and the
 * button that unfolds its sublayers; what belongs to the layer (why it is unavailable, its
 * sublayers, its opacity) goes below the row, inside the same box.
 */
function LayerRow({
  id,
  title,
  subtitle,
  titleExtra,
  active,
  disabled,
  expandable,
  expanded,
  onToggle,
  onExpand,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  /** Beside the title: the status of the service. */
  titleExtra?: React.ReactNode;
  active: boolean;
  disabled: boolean;
  expandable: boolean;
  expanded: boolean;
  onToggle(): void;
  onExpand(): void;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl px-3 py-2 ${active ? 'bg-[var(--accent-soft)]' : ''}`}>
      <div className={`flex items-start gap-3 ${disabled ? 'opacity-60' : ''}`}>
        <input
          id={id}
          type="checkbox"
          checked={active}
          disabled={disabled}
          onChange={onToggle}
          aria-label={title}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)] phone:h-5 phone:w-5"
        />
        <label htmlFor={id} className={`min-w-0 flex-1 ${disabled ? '' : 'cursor-pointer'}`}>
          <span className="flex items-center gap-2 text-sm font-medium">
            {title}
            {titleExtra}
          </span>
          {subtitle && <span className="block text-xs text-[var(--muted)]">{subtitle}</span>}
        </label>
        {expandable && (
          <button
            type="button"
            onClick={onExpand}
            aria-expanded={expanded}
            aria-label={t('layers.serviceLayers', { title })}
            className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--hover)] phone:p-2.5"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/** "Why unavailable?": the reason in plain words, what the server answered, and a link. */
function Why({ status, detail, checked }: { status: WhyStatus; detail?: string; checked?: string }) {
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
        {status === 'degraded' ? t('layers.whyDegraded') : status === 'slow' ? t('layers.whySlow') : t('layers.whyBlocked')}
      </button>
      {open && (
        <div className="mt-1 rounded-lg bg-[var(--field)] px-3 py-2 text-xs leading-relaxed">
          <p>{why(status)}</p>
          {(detail || checked) && (
            <p className="mt-1 text-[var(--muted)]">
              {detail && <>{t('layers.serverAnswer', { detail })} </>}
              {checked && t('layers.checked', { date: checked })}
            </p>
          )}
          {FALLBACK && (
            <a href={FALLBACK.url} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 text-[var(--accent)]">
              {t('layers.seeFallback', { name: FALLBACK.name })} <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <NewTab />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: ServiceStatus }) {
  const icon = STATUS_ICON[status];
  // One dot for both normal states: telling "works" from "not loaded yet" by colour alone would
  // not do (WCAG 1.4.1), and the accent keeps 3:1 against the panel (1.4.11).
  if (!icon) return <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-hidden="true" />;
  const [Icon, colour] = icon;
  return (
    <Icon className={`h-3.5 w-3.5 shrink-0 ${colour}`} role="img" aria-label={statusLabel(status)}>
      <title>{statusLabel(status)}</title>
    </Icon>
  );
}

function OverlayItem({ s, hits, startOpen = false }: { s: Overlay; hits: string[]; startOpen?: boolean }) {
  const active = useMapStore((m) => m.overlays.includes(s.id));
  const toggle = useMapStore((m) => m.toggleOverlay);
  const opacity = useMapStore((m) => overlayOpacity(s.id, m.opacity));
  const setOpacity = useMapStore((m) => m.setOpacity);
  const status = useStatusStore((st) => {
    const known = statusOf(st.status, s.id);
    return st.slow.includes(s.id) && (known === 'ok' || known === 'unknown') ? 'slow' : known;
  });
  const [expanded, setExpanded] = useState(startOpen);
  const blocked = status === 'blocked';
  const open = expanded || hits.length > 0;

  return (
    <LayerRow
      id={`ov-${s.id}`}
      title={s.title}
      subtitle={s.description}
      titleExtra={<StatusDot status={status} />}
      active={active}
      disabled={blocked}
      expandable={s.sublayers.length > 1}
      expanded={open}
      onToggle={() => toggle(s.id)}
      onExpand={() => setExpanded(!open)}
    >
      {(status === 'blocked' || status === 'down' || status === 'degraded' || status === 'slow') && (
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
          aria-label={t('layers.opacity', { title: s.title })}
          onChange={(e) => setOpacity(s.id, Number(e.target.value))}
          className="mt-1 ml-7 h-6 w-[calc(100%-1.75rem)] cursor-pointer accent-[var(--accent)]"
        />
      )}
    </LayerRow>
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
    ? t('layers.visibleFrom', { scale: scaleText(meta?.maxScale ?? 0) })
    : t('layers.visibleTo', { scale: scaleText(meta?.minScale ?? 0) });
  return (
    <li className={`flex items-center gap-1 rounded-lg text-sm ${highlighted ? 'bg-[var(--field)] font-medium' : ''}`}>
      <label className="flex min-h-8 flex-1 cursor-pointer items-center gap-2 px-1.5 py-1 phone:min-h-11">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={() => toggle(s.id, l.name)}
          aria-label={`${s.title}: ${l.title}`}
          className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)] phone:h-4.5 phone:w-4.5"
        />
        {/* Greyed while the server does not draw it at this scale; the hint says from which scale it does. */}
        <span className={outOfScale ? 'text-[var(--muted)]' : ''} title={outOfScale ? t('layers.hiddenNow', { hint }) : undefined}>
          {l.title}
        </span>
      </label>
      {checked && outOfScale && (
        // Outside the label, so a click next to it cannot switch the layer off.
        <button
          type="button"
          onClick={() => zoomToScale(targetScale)}
          title={hint}
          aria-label={t(zoomedOutTooFar ? 'layers.zoomInTo' : 'layers.zoomOutTo', { title: l.title, hint })}
          className="flex min-h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-[var(--accent)] hover:bg-[var(--hover)]"
        >
          {zoomedOutTooFar ? <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> : <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />}
          {zoomedOutTooFar ? t('layers.zoomIn') : t('layers.zoomOut')}
        </button>
      )}
    </li>
  );
}
