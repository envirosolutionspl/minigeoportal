import { useEffect, useState } from 'react';
import { Camera, Download, ExternalLink, FileText, History } from 'lucide-react';
import { config } from '@/config/runtime';
import { dateText } from '@/map/format';
import { zoomForScale } from '@/map/projection';
import { useInfoStore } from '@/state/info';
import { useMapStore } from '@/state/store';
import { locale, t } from '@/i18n';
import { parcelReportUrl } from './parcelReport';
import { orthoAt, pixelText, type OrthoEdition, type OrthoInfo } from './ortho';

/** The time view shows the archive of these photos (app.yaml: ortho.history names its layer). */
const TIME_VIEW = config.modules.gugik?.ortho && config.modules.gugik.ortho.history === config.map.timeTravel?.layer;
/** Scale the time view opens at from the place panel, when the map is further out. */
const OPENING_SCALE = 20000;

/** The photo the archival map shows as of a date: the newest taken on or before it. */
export function photoAsOf(history: OrthoEdition[], date: string): OrthoEdition | undefined {
  return history.filter((e) => e.date <= date).at(-1);
}

/** Parts of the place panel (src/ui/InfoPanel.tsx) the gugik module adds. */

/** A link to the parcel report of geoportal.gov.pl for the clicked point. */
export function ParcelReportLink({ coordinate }: { coordinate: [number, number] }) {
  return (
    <a
      href={parcelReportUrl(coordinate)}
      target="_blank"
      rel="noopener"
      className="mt-1.5 inline-flex min-h-6 items-center gap-1.5 text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
    >
      <FileText className="h-4 w-4" aria-hidden="true" />
      {t('info.parcelReport')}
      <span className="sr-only">{t('info.parcelReportHint')}</span>
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}

/** The date of the photo matters only when the photos are on screen: a base map drawn by their tile service. */
export function OrthoPhoto({ coordinate }: { coordinate: [number, number] }) {
  const ortho = config.modules.gugik?.ortho;
  const service = ortho ? ortho.service : undefined;
  const showsPhotos = useMapStore(
    (m) => config.map.baseMaps.find((b) => b.id === m.base)?.sources.some((s) => s.service === service) ?? false,
  );
  return showsPhotos ? <PhotoDate coordinate={coordinate} /> : null;
}

type OrthoState = { status: 'loading' } | { status: 'done'; info: OrthoInfo } | { status: 'error' };

/**
 * When the aerial photo here was taken and how sharp it is, with its sheet to download; with
 * older photos of the place, the way into the time view. In the time view: the photo shown as
 * of the chosen date.
 */
function PhotoDate({ coordinate }: { coordinate: [number, number] }) {
  const [state, setState] = useState<OrthoState>({ status: 'loading' });
  const asOf = useMapStore((m) => (TIME_VIEW && m.tool === 'time' ? m.time : null));
  const seeChanges = () => {
    const m = useMapStore.getState();
    useInfoStore.getState().close();
    m.setTool('time');
    m.focusOn({ center: coordinate, zoom: Math.max(m.zoom, zoomForScale(OPENING_SCALE)) });
  };

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
  const history = state.status === 'done' ? (state.info.history ?? []) : [];
  const shown = asOf ? photoAsOf(history, asOf) : undefined;

  return (
    <div className="flex items-start gap-2 border-t border-[var(--hover)] px-4 py-2 text-xs">
      <Camera className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
      {asOf && latest ? (
        <p className="min-w-0">
          {shown ? (
            <>
              {t('info.photoAsOf', { date: dateText(asOf) })} <strong className="font-semibold">{dateText(shown.date)}</strong>,{' '}
              {t('info.pixel')} <strong className="font-semibold">{pixelText(shown.pixel)}</strong>
            </>
          ) : (
            t('time.none')
          )}
        </p>
      ) : latest ? (
        <p className="min-w-0">
          {t('info.photoFrom')} <strong className="font-semibold">{dateText(latest.date)}</strong>, {t('info.pixel')}{' '}
          <strong className="font-semibold">{pixelText(latest.pixel)}</strong>
          {TIME_VIEW && history.length > 1 && (
            <>
              {' · '}
              {t('info.photos', { count: history.length, year: history[0].date.slice(0, 4) })}{' '}
              <button
                type="button"
                onClick={seeChanges}
                className="inline-flex items-center gap-1 font-medium text-[var(--accent)] underline underline-offset-2"
              >
                <History className="h-3 w-3" aria-hidden="true" />
                {t('info.seeChanges')}
              </button>
            </>
          )}
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
