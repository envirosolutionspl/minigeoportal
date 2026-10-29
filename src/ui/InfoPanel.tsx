import { Suspense } from 'react';
import { Bug, ExternalLink, Layers, LoaderCircle, MapPin, ZoomIn, ZoomOut } from 'lucide-react';
import { formatCoordinate, scaleText } from '@/map/format';
import { config, selectedSublayers } from '@/config/runtime';
import { infoFooter, infoHeader, type InfoPart } from '@/modules';
import { overlayDef } from '@/services/catalog';
import { nearestQueryable, type InfoRecord, type ScaleHint } from '@/services/featureinfo';
import { useInfoStore, type InfoResult } from '@/state/info';
import { useMapStore } from '@/state/store';
import { useReport } from './ReportDialog';
import { NewTab } from './NewTab';
import { CloseButton } from './CloseButton';
import { t } from '@/i18n';

/** Results of a map click: one section per queried overlay. */
export function InfoPanel() {
  const query = useInfoStore((s) => s.query);
  const close = useInfoStore((s) => s.close);
  if (!query) return null;

  const loading = query.services.some((id) => query.results[id]?.status === 'loading');

  return (
    <section
      aria-label={t('info.title')}
      // On phones .info-panel (index.css) makes it a full-height sheet, as the layer list.
      className="info-panel absolute inset-x-0 bottom-0 z-30 flex max-h-[60dvh] flex-col rounded-t-3xl pb-[var(--safe-bottom)] bg-[var(--surface)] shadow-2xl
        sm:inset-x-auto sm:top-[4.75rem] sm:bottom-auto sm:left-4 sm:max-h-[calc(100dvh-9rem)] sm:w-[25rem] sm:rounded-2xl"
    >
      <header className="flex items-start gap-3 border-b border-[var(--hover)] px-4 pt-4 pb-3">
        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[var(--highlight-ui,var(--highlight))]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{t('info.title')}</h2>
          <p className="text-xs text-[var(--muted)]">{formatCoordinate(query.coordinate)}</p>
          <Parts parts={infoHeader} coordinate={query.coordinate} />
        </div>
        <CloseButton onClick={close} />
      </header>

      <p role="status" className="sr-only">
        {loading ? t('info.loading') : t('info.ready')}
      </p>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {query.services.length === 0 ? (
          <NoAnswer />
        ) : (
          query.services.map((id) => <ServiceResult key={id} id={id} result={query.results[id]} />)
        )}
      </div>
      <Parts parts={infoFooter} coordinate={query.coordinate} />
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

/** The layer that is on and answers nearest to the map's scale, with its title as the list names it. */
function scaleHint(overlays: string[], sublayers: Record<string, string[]>, scale: number): ScaleHint | undefined {
  let best: ScaleHint | undefined;
  for (const id of overlays) {
    const def = overlayDef(id);
    const near = def && nearestQueryable(def, selectedSublayers(def, sublayers), scale);
    if (near && (!best || Math.abs(Math.log(near.scale / scale)) < Math.abs(Math.log(best.scale / scale)))) {
      best = { ...near, title: def.title };
    }
  }
  return best;
}

/**
 * No layer answered here: the layers that are on answer at other scales only, so the panel says
 * from which scale and offers to go there; with none on, it points to the list of layers.
 */
function NoAnswer() {
  const setPanel = useMapStore((m) => m.setPanel);
  const zoomToScale = useMapStore((m) => m.zoomToScale);
  const overlays = useMapStore((m) => m.overlays);
  const sublayers = useMapStore((m) => m.sublayers);
  const scale = useMapStore((m) => m.scale);
  const hint = scaleHint(overlays, sublayers, scale);
  const button = 'mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]';
  if (hint) {
    const zoomIn = hint.scale < scale;
    return (
      <div className="py-4 text-sm">
        <p>{t(zoomIn ? 'info.zoomInHint' : 'info.zoomOutHint', { title: hint.title, scale: scaleText(hint.limit) })}</p>
        <button type="button" onClick={() => zoomToScale(hint.scale)} className={button}>
          {zoomIn ? <ZoomIn className="h-4 w-4" aria-hidden="true" /> : <ZoomOut className="h-4 w-4" aria-hidden="true" />}
          {t(zoomIn ? 'info.zoomIn' : 'info.zoomOut')}
        </button>
      </div>
    );
  }
  return (
    <div className="py-4 text-sm">
      <p>{t('info.noLayers')}</p>
      <button type="button" onClick={() => setPanel('catalog')} className={button}>
        <Layers className="h-4 w-4" aria-hidden="true" /> {t('info.openLayers')}
      </button>
    </div>
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
              <NewTab />
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
            <dt className="min-w-0 break-words text-[var(--muted)]">{f.label}</dt>
            <dd className="min-w-0 break-words">
              {f.href ? (
                <a
                  href={f.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[var(--accent)] underline"
                >
                  {f.value} <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <NewTab />
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

/** Parts of the place panel the modules add (src/modules), each loading on its own. */
function Parts({ parts, coordinate }: { parts: InfoPart[]; coordinate: [number, number] }) {
  return parts.map((Part, i) => (
    <Suspense key={i} fallback={null}>
      <Part coordinate={coordinate} />
    </Suspense>
  ));
}
