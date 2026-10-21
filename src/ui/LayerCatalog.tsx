import { useMemo, useState } from 'react';
import { ExternalLink, Search, X } from 'lucide-react';
import { BASE_SERVICES, OVERLAY_SERVICES, TOPICS, type ServiceDef, type Topic } from '@/services/registry';
import { useStatusStore, type ServiceStatus } from '@/services/status';
import { serviceOpacity, useMapStore } from '@/state/store';

const STATUS_LABEL: Record<ServiceStatus, string> = {
  unknown: 'Sprawdzanie',
  ok: 'Dostępna',
  slow: 'Działa wolno',
  blocked: 'Dostępna tylko na geoportal.gov.pl',
  down: 'Usługa nie odpowiada',
  degraded: 'Część danych nie ładuje się w tym miejscu',
};

const STATUS_DOT: Record<ServiceStatus, string> = {
  unknown: 'bg-neutral-400',
  ok: 'bg-emerald-500',
  slow: 'bg-amber-500',
  blocked: 'bg-neutral-400',
  down: 'bg-red-500',
  degraded: 'bg-amber-500',
};

function matches(s: ServiceDef, q: string): boolean {
  if (!q) return true;
  const hay = [s.title, s.description, ...s.keywords, TOPICS[s.topic]].join(' ').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

function StatusDot({ status }: { status: ServiceStatus }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[status]}`} title={STATUS_LABEL[status]} />;
}

function BaseItem({ s }: { s: ServiceDef }) {
  const active = useMapStore((m) => m.base === s.id);
  const setBase = useMapStore((m) => m.setBase);
  const status = useStatusStore((st) => st.status[s.id] ?? 'unknown');
  const blocked = status === 'blocked';
  return (
    <button
      type="button"
      disabled={blocked}
      onClick={() => setBase(s.id)}
      aria-pressed={active}
      aria-label={s.title}
      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition ${
        active
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-transparent hover:bg-[var(--hover)]'
      } ${blocked ? 'opacity-50' : ''}`}
    >
      <span className="mt-1.5">
        <StatusDot status={status} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{s.title}</span>
        <span className="block text-xs text-[var(--muted)]">{blocked ? STATUS_LABEL.blocked : s.description}</span>
      </span>
    </button>
  );
}

function OverlayItem({ s }: { s: ServiceDef }) {
  const active = useMapStore((m) => m.overlays.includes(s.id));
  const toggle = useMapStore((m) => m.toggleOverlay);
  const opacity = useMapStore((m) => serviceOpacity(s.id, m.opacity));
  const setOpacity = useMapStore((m) => m.setOpacity);
  const status = useStatusStore((st) => st.status[s.id] ?? 'unknown');
  const blocked = status === 'blocked';
  return (
    <div className={`rounded-xl px-3 py-2 ${active ? 'bg-[var(--accent-soft)]' : ''} ${blocked ? 'opacity-60' : ''}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={active}
          disabled={blocked}
          onChange={() => toggle(s.id)}
          className="mt-1 h-4 w-4 accent-[var(--accent)]"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            {s.title}
            <StatusDot status={status} />
          </span>
          <span className="block text-xs text-[var(--muted)]">{s.description}</span>
          {blocked && (
            <a
              href={s.geoportalUrl}
              target="_blank"
              rel="noopener"
              className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--accent)]"
            >
              {STATUS_LABEL.blocked} <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </span>
      </label>
      {active && (
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={opacity}
          aria-label={`Przezroczystość: ${s.title}`}
          onChange={(e) => setOpacity(s.id, Number(e.target.value))}
          className="mt-2 ml-7 h-1 w-[calc(100%-1.75rem)] accent-[var(--accent)]"
        />
      )}
    </div>
  );
}

export function LayerCatalog() {
  const close = useMapStore((m) => m.setPanel);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<Topic | null>(null);

  const filtered = useMemo(() => {
    const keep = (s: ServiceDef) => matches(s, query) && (topic === null || s.topic === topic);
    return { base: BASE_SERVICES.filter(keep), overlays: OVERLAY_SERVICES.filter(keep) };
  }, [query, topic]);

  const filtering = query !== '' || topic !== null;
  const starters = filtering ? [] : OVERLAY_SERVICES.filter((s) => s.starter);
  const rest = filtering ? filtered.overlays : OVERLAY_SERVICES.filter((s) => !s.starter);

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
            placeholder="Szukaj warstwy: gaz, plan, ceny…"
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
                topic === t ? 'bg-[var(--accent)] text-white' : 'bg-[var(--field)] hover:bg-[var(--hover)]'
              }`}
            >
              {TOPICS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {filtered.base.length > 0 && (
          <Group title="Podkład">
            {filtered.base.map((s) => (
              <BaseItem key={s.id} s={s} />
            ))}
          </Group>
        )}
        {starters.length > 0 && (
          <Group title="Na start">
            {starters.map((s) => (
              <OverlayItem key={s.id} s={s} />
            ))}
          </Group>
        )}
        {rest.length > 0 && (
          <Group title={filtering ? 'Warstwy' : 'Pozostałe'}>
            {rest.map((s) => (
              <OverlayItem key={s.id} s={s} />
            ))}
          </Group>
        )}
        {filtered.base.length + filtered.overlays.length === 0 && (
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
