import { useEffect, useState } from 'react';
import { Bug, Camera, Download, ExternalLink, FileText, Layers, LoaderCircle, MapPin, X } from 'lucide-react';
import { formatCoordinate } from '@/map/format';
import { BASE_MAPS, GEOPORTAL_MAP, parcelReportUrl } from '@/services/registry';
import { overlayDef } from '@/services/catalog';
import type { InfoRecord } from '@/services/featureinfo';
import { useInfoStore, type InfoResult } from '@/state/info';
import { useMapStore } from '@/state/store';
import { useReport } from './ReportDialog';
import { dateText, orthoAt, pixelText, type OrthoInfo } from '@/services/ortho';

/** Results of a map click: one section per queried overlay. */
export function InfoPanel() {
  const query = useInfoStore((s) => s.query);
  const close = useInfoStore((s) => s.close);
  const setPanel = useMapStore((m) => m.setPanel);
  // The photo date matters only when the photos are on screen.
  const showsPhotos = useMapStore((m) => BASE_MAPS.find((b) => b.id === m.base)?.sources.some((s) => s.service === 'orto') ?? false);
  if (!query) return null;

  const [e, n] = query.coordinate;
  const loading = query.services.some((id) => query.results[id]?.status === 'loading');

  return (
    <section
      aria-label="Informacje o miejscu"
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[60dvh] flex-col rounded-t-3xl bg-[var(--surface)] shadow-2xl
        sm:inset-x-auto sm:top-[4.75rem] sm:bottom-auto sm:left-4 sm:max-h-[calc(100dvh-9rem)] sm:w-[25rem] sm:rounded-2xl"
    >
      <header className="flex items-start gap-3 border-b border-[var(--hover)] px-4 pt-4 pb-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--highlight)]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Informacje o miejscu</h2>
          <p className="text-xs text-[var(--muted)]">{formatCoordinate(query.coordinate)}</p>
          <a
            href={parcelReportUrl(query.coordinate)}
            target="_blank"
            rel="noopener"
            className="mt-1.5 inline-flex min-h-6 items-center gap-1.5 text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            Raport o działce
            <span className="sr-only">(geoportal.gov.pl, otwiera się w nowej karcie)</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
        <button type="button" onClick={close} aria-label="Zamknij" className="rounded-full p-2 hover:bg-[var(--hover)]">
          <X className="h-5 w-5" />
        </button>
      </header>

      <p role="status" className="sr-only">
        {loading ? 'Wczytuję informacje o miejscu…' : 'Informacje o miejscu są gotowe.'}
      </p>
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
      {showsPhotos && <OrthoPhoto coordinate={query.coordinate} />}
      <footer className="border-t border-[var(--hover)] px-4 py-2">
        <button
          type="button"
          onClick={() =>
            useReport.getState().openReport(`Miejsce: PL-1992 X ${Math.round(n)}, Y ${Math.round(e)}

`)
          }
          className="inline-flex min-h-6 items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--accent)]"
        >
          <Bug className="h-3.5 w-3.5" aria-hidden="true" /> Coś nie działa? Zgłoś błąd
        </button>
      </footer>
    </section>
  );
}

function ServiceResult({ id, result }: { id: string; result: InfoResult | undefined }) {
  const def = overlayDef(id);
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
      {result.status === 'done' && result.records.length === 0 && <p className="text-sm text-[var(--muted)]">Brak danych w tym miejscu.</p>}
      {result.status === 'done' && result.records.map((r, i) => <RecordView key={i} record={r} />)}
    </div>
  );
}

function RecordView({ record }: { record: InfoRecord }) {
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

type OrthoState = { status: 'loading' } | { status: 'done'; info: OrthoInfo } | { status: 'error' };

/** When the aerial photo here was taken and how sharp it is, with its sheet to download. */
function OrthoPhoto({ coordinate }: { coordinate: [number, number] }) {
  const [state, setState] = useState<OrthoState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    orthoAt(coordinate, controller.signal)
      .then((info) => setState({ status: 'done', info }))
      .catch(() => !controller.signal.aborted && setState({ status: 'error' }));
    return () => controller.abort();
  }, [coordinate]);

  const latest = state.status === 'done' ? state.info.latest : undefined;
  if (state.status === 'error' || (state.status === 'done' && !latest)) return null;

  return (
    <div className="flex items-start gap-2 border-t border-[var(--hover)] px-4 py-2 text-xs">
      <Camera className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
      {latest ? (
        <p className="min-w-0">
          Ortofotomapa ze zdjęcia z <strong className="font-semibold">{dateText(latest.date)}</strong>, piksel{' '}
          <strong className="font-semibold">{pixelText(latest.pixel)}</strong>
          {latest.download && (
            <>
              {' · '}
              <a
                href={latest.download}
                className="inline-flex items-center gap-1 text-[var(--accent)] underline underline-offset-2"
                download
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                pobierz arkusz {latest.sheet} (GeoTIFF{latest.sizeMb ? `, ${latest.sizeMb.toLocaleString('pl-PL')} MB` : ''})
              </a>
            </>
          )}
        </p>
      ) : (
        <p className="text-[var(--muted)]">Sprawdzam datę zdjęcia lotniczego…</p>
      )}
    </div>
  );
}
