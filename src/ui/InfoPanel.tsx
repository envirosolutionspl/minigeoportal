import { ExternalLink, Layers, LoaderCircle, MapPin, X } from 'lucide-react';
import { toLonLat } from 'ol/proj';
import { GEOPORTAL_MAP, OVERLAY_BY_ID } from '@/services/registry';
import type { InfoRecord } from '@/services/featureinfo';
import { useInfoStore, type InfoResult } from '@/state/info';
import { useMapStore } from '@/state/store';

const fmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });

/** Results of a map click: one section per queried overlay. */
export function InfoPanel() {
  const query = useInfoStore((s) => s.query);
  const close = useInfoStore((s) => s.close);
  const setPanel = useMapStore((m) => m.setPanel);
  if (!query) return null;

  const [lon, lat] = toLonLat(query.coordinate, 'EPSG:2180');
  const [e, n] = query.coordinate;

  return (
    <section
      aria-label="Informacje o miejscu"
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[60dvh] flex-col rounded-t-3xl bg-[var(--surface)] shadow-2xl
        sm:inset-x-auto sm:top-[4.75rem] sm:bottom-auto sm:left-4 sm:max-h-[calc(100dvh-9rem)] sm:w-[25rem] sm:rounded-2xl"
    >
      <header className="flex items-start gap-3 border-b border-[var(--hover)] px-4 pt-4 pb-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#FF8142]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Informacje o miejscu</h2>
          <p className="text-xs text-[var(--muted)]">
            {lat.toFixed(5)}° N, {lon.toFixed(5)}° E · PL-1992: {fmt.format(n)} N, {fmt.format(e)} E
          </p>
        </div>
        <button type="button" onClick={close} aria-label="Zamknij" className="rounded-full p-2 hover:bg-[var(--hover)]">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {query.services.length === 0 ? (
          <div className="py-4 text-sm">
            <p>Włącz warstwę, na przykład ewidencję gruntów albo plan miejscowy, aby zobaczyć informacje o tym miejscu.</p>
            <button
              type="button"
              onClick={() => setPanel('catalog')}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]"
            >
              <Layers className="h-4 w-4" /> Otwórz warstwy
            </button>
          </div>
        ) : (
          query.services.map((id) => <ServiceResult key={id} id={id} result={query.results[id]} />)
        )}
      </div>
    </section>
  );
}

function ServiceResult({ id, result }: { id: string; result: InfoResult | undefined }) {
  const def = OVERLAY_BY_ID.get(id);
  if (!def || !result) return null;
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">{def.title}</h3>
      {result.status === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Wczytywanie…
        </p>
      )}
      {result.status === 'error' && (
        <p className="text-sm text-[var(--muted)]">
          Nie udało się pobrać danych. Serwer usługi nie odpowiada albo odrzucił zapytanie.{' '}
          <a href={GEOPORTAL_MAP} target="_blank" rel="noopener" className="text-[var(--accent)] underline">
            Sprawdź w geoportal.gov.pl
          </a>
        </p>
      )}
      {result.status === 'done' && result.records.length === 0 && (
        <p className="text-sm text-[var(--muted)]">Brak danych w tym miejscu.</p>
      )}
      {result.status === 'done' && result.records.map((r, i) => <Record key={i} record={r} />)}
    </div>
  );
}

function Record({ record }: { record: InfoRecord }) {
  return (
    <div className="mb-2 rounded-xl bg-[var(--field)] px-3 py-2 last:mb-0">
      {record.title && <p className="mb-1 text-sm font-medium">{record.title}</p>}
      <dl className="grid grid-cols-[minmax(7rem,40%)_1fr] gap-x-3 gap-y-1 text-sm">
        {record.fields.map((f, i) => (
          <div key={i} className="contents">
            <dt className="text-[var(--muted)]">{f.label}</dt>
            <dd className="min-w-0 break-words">
              {f.href ? (
                <a
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--accent)] underline"
                >
                  {f.value} <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                f.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
