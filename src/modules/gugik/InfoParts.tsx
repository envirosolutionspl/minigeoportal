import { useEffect, useState } from 'react';
import { Camera, Download, ExternalLink, FileText } from 'lucide-react';
import { config } from '@/config/runtime';
import { dateText } from '@/map/format';
import { useMapStore } from '@/state/store';
import { locale, t } from '@/i18n';
import { parcelReportUrl } from './parcelReport';
import { orthoAt, pixelText, type OrthoInfo } from './ortho';

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

/** When the aerial photo here was taken and how sharp it is, with its sheet to download. */
function PhotoDate({ coordinate }: { coordinate: [number, number] }) {
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
