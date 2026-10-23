import { useEffect, useState } from 'react';
import { Bug, Camera, Download, ExternalLink, FileText, Layers, LoaderCircle, MapPin, X } from 'lucide-react';
import { dateText, formatCoordinate } from '@/map/format';
import { config } from '@/config/runtime';
import { parcelReportUrl } from '@/modules/gugik/parcelReport';
import { overlayDef } from '@/services/catalog';
import type { InfoRecord } from '@/services/featureinfo';
import { useInfoStore, type InfoResult } from '@/state/info';
import { useMapStore } from '@/state/store';
import { useReport } from './ReportDialog';
import { orthoAt, pixelText, type OrthoInfo } from '@/modules/gugik/ortho';
import { locale, t } from '@/i18n';

/** Results of a map click: one section per queried overlay. */
export function InfoPanel() {
  const query = useInfoStore((s) => s.query);
  const close = useInfoStore((s) => s.close);
  const setPanel = useMapStore((m) => m.setPanel);
  // The photo date (gugik module) matters only when the photos are on screen.
  const showsPhotos = useMapStore(
    (m) =>
      Boolean(config.modules.gugik?.ortho) &&
      (config.map.baseMaps.find((b) => b.id === m.base)?.sources.some((s) => s.service === 'orto') ?? false),
  );
  if (!query) return null;

  const loading = query.services.some((id) => query.results[id]?.status === 'loading');

  return (
    <section
      aria-label={t('info.title')}
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[60dvh] flex-col rounded-t-3xl pb-[var(--safe-bottom)] bg-[var(--surface)] shadow-2xl
        sm:inset-x-auto sm:top-[4.75rem] sm:bottom-auto sm:left-4 sm:max-h-[calc(100dvh-9rem)] sm:w-[25rem] sm:rounded-2xl"
    >
      <header className="flex items-start gap-3 border-b border-[var(--hover)] px-4 pt-4 pb-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--highlight)]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{t('info.title')}</h2>
          <p className="text-xs text-[var(--muted)]">{formatCoordinate(query.coordinate)}</p>
          {config.modules.gugik?.parcelReport && (
            <a
              href={parcelReportUrl(query.coordinate)}
              target="_blank"
              rel="noopener"
              className="mt-1.5 inline-flex min-h-6 items-center gap-1.5 text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              {t('info.parcelReport')}
              <span className="sr-only">{t('info.parcelReportHint')}</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
        <button type="button" onClick={close} aria-label={t('common.close')} className="rounded-full p-2 hover:bg-[var(--hover)]">
          <X className="h-5 w-5" />
        </button>
      </header>

      <p role="status" className="sr-only">
        {loading ? t('info.loading') : t('info.ready')}
      </p>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {query.services.length === 0 ? (
          <div className="py-4 text-sm">
            <p>{t('info.noLayers')}</p>
            <button
              type="button"
              onClick={() => setPanel('catalog')}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]"
            >
              <Layers className="h-4 w-4" /> {t('info.openLayers')}
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
            useReport.getState().openReport(`${t('info.reportPlace', { place: formatCoordinate(query.coordinate) })}

`)
          }
          className="inline-flex min-h-6 items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--accent)]"
        >
          <Bug className="h-3.5 w-3.5" aria-hidden="true" /> {t('info.report')}
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
          <LoaderCircle className="h-4 w-4 animate-spin" /> {t('common.loading')}
        </p>
      )}
      {result.status === 'error' && (
        <p className="text-sm text-[var(--muted)]">
          {t('info.error')}{' '}
          {config.links.fallbackMap && (
            <a href={config.links.fallbackMap.url} target="_blank" rel="noopener" className="text-[var(--accent)] underline">
              {t('info.checkFallback', { name: config.links.fallbackMap.name })}
            </a>
          )}
        </p>
      )}
      {result.status === 'done' && result.records.length === 0 && <p className="text-sm text-[var(--muted)]">{t('info.empty')}</p>}
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
          {t('info.photoFrom')} <strong className="font-semibold">{dateText(latest.date)}</strong>, {t('info.pixel')}{' '}
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
                {t('info.downloadSheet', { sheet: latest.sheet })} (GeoTIFF
                {latest.sizeMb ? `, ${latest.sizeMb.toLocaleString(locale())} MB` : ''})
              </a>
            </>
          )}
        </p>
      ) : (
        <p className="text-[var(--muted)]">{t('info.photoLoading')}</p>
      )}
    </div>
  );
}
