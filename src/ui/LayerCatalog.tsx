import { useMemo, useState } from 'react';
import { ChevronDown, ExternalLink, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import { GEOPORTAL_MAP, OVERLAYS, TOPICS, selectedSublayers, type Overlay, type SubLayer, type Topic } from '@/services/registry';
import { layerMeta, visibleAtScale } from '@/services/meta';
import { normalize } from '@/services/text';
import { statusOf, useStatusStore, type ServiceStatus } from '@/services/status';
import { overlayOpacity, useMapStore } from '@/state/store';

const STATUS_LABEL: Record<ServiceStatus, string> = {
  unknown: 'Jeszcze nie wczytywana',
  ok: 'Dostępna',
  blocked: 'Dostępna tylko na geoportal.gov.pl',
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


/** Words of the query that every match must contain, ignoring case and Polish diacritics. */
function words(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

function textMatches(text: string, q: string[]): boolean {
  const hay = normalize(text);
  return q.every((w) => hay.includes(w));
}

function serviceText(s: Overlay): string {
  return [s.title, s.description, ...s.keywords, TOPICS[s.topic]].join(' ');
}

export function LayerCatalog() {
  const close = useMapStore((m) => m.setPanel);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<Topic | null>(null);
  const q = useMemo(() => words(query), [query]);

  /** Services matching the filter; matching sublayers open the service with those rows highlighted. */
  const results = useMemo(
    () =>
      OVERLAYS.filter((s) => topic === null || s.topic === topic)
        .map((s) => {
          if (q.length === 0) return { s, hits: [] as string[] };
          const hits = s.sublayers.filter((l) => textMatches(l.title, q)).map((l) => l.name);
          return hits.length > 0 || textMatches(serviceText(s), q) ? { s, hits } : null;
        })
        .filter((r): r is { s: Overlay; hits: string[] } => r !== null),
    [q, topic],
  );

  const filtering = q.length > 0 || topic !== null;
  const starters = filtering ? [] : results.filter((r) => r.s.starter);
  const rest = filtering ? results : results.filter((r) => !r.s.starter);

  return (
    <section className="flex h-full flex-col" aria-label="Katalog warstw">
      <header className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h2 className="flex-1 text-base font-semibold">Warstwy</h2>
        <button
          type="button"
          onClick={() => close('none')}
          aria-label="Zamknij"
          className="rounded-full p-2 hover:bg-[var(--hover)]"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="px-4 pb-2">
        <label className="flex items-center gap-2 rounded-xl bg-[var(--field)] px-3 py-2">
          <Search className="h-4 w-4 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj warstwy: woda, gaz, plan, ceny…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(TOPICS) as Topic[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(topic === t ? null : t)}
              aria-pressed={topic === t}
              className={`rounded-full px-3 py-1 text-xs transition ${
                topic === t ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--field)] hover:bg-[var(--hover)]'
              }`}
            >
              {TOPICS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {starters.length > 0 && (
          <Group title="Na start">
            {starters.map(({ s, hits }) => (
              <OverlayItem key={s.id} s={s} hits={hits} />
            ))}
          </Group>
        )}
        {rest.length > 0 && (
          <Group title={filtering ? 'Wyniki' : 'Pozostałe'}>
            {rest.map(({ s, hits }) => (
              <OverlayItem key={s.id} s={s} hits={hits} />
            ))}
          </Group>
        )}
        {results.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">Brak warstw dla tego filtru.</p>
        )}
      </div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{title}</h3>
      <div className="flex flex-col gap-0.5">{children}</div>
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

function OverlayItem({ s, hits }: { s: Overlay; hits: string[] }) {
  const active = useMapStore((m) => m.overlays.includes(s.id));
  const toggle = useMapStore((m) => m.toggleOverlay);
  const opacity = useMapStore((m) => overlayOpacity(s.id, m.opacity));
  const setOpacity = useMapStore((m) => m.setOpacity);
  const status = useStatusStore((st) => statusOf(st.status, s.id));
  const [expanded, setExpanded] = useState(false);
  const blocked = status === 'blocked';
  const open = expanded || hits.length > 0;

  return (
    <div className={`rounded-xl px-3 py-2 ${active ? 'bg-[var(--accent-soft)]' : ''} ${blocked ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
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
        <button
          type="button"
          onClick={() => setExpanded(!open)}
          aria-expanded={open}
          aria-label={`Warstwy usługi: ${s.title}`}
          className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--hover)]"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {(status === 'blocked' || status === 'degraded') && (
        <a
          href={GEOPORTAL_MAP}
          target="_blank"
          rel="noopener"
          className="mt-1 ml-7 inline-flex items-center gap-1 text-xs text-[var(--accent)]"
        >
          {STATUS_LABEL[status]}: otwórz w geoportal.gov.pl <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {open && (
        <ul className="mt-2 ml-7 flex flex-col gap-1">
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
  const checked = useMapStore((m) => m.overlays.includes(s.id) && selectedSublayers(s, m.sublayers).includes(l.name));
  const toggle = useMapStore((m) => m.toggleSublayer);
  const zoomToScale = useMapStore((m) => m.zoomToScale);
  const outOfScale = useMapStore((m) => !visibleAtScale(s.id, l.name, m.scale));
  const meta = layerMeta(s.id, l.name);
  const zoomedOutTooFar = useMapStore((m) => outOfScale && meta?.maxScale !== undefined && m.scale > meta.maxScale);
  /** Scale the map should go to for the layer to appear: just inside its visible range. */
  const targetScale = zoomedOutTooFar ? (meta?.maxScale ?? 0) * 0.9 : (meta?.minScale ?? 0) * 1.1;
  const hint = zoomedOutTooFar
    ? `Widoczne od skali 1:${Math.round(meta?.maxScale ?? 0)}`
    : `Widoczne do skali 1:${Math.round(meta?.minScale ?? 0)}`;
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
        <span className={outOfScale ? 'text-[var(--muted)]' : ''}>{l.title}</span>
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
