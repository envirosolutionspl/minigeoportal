import { useId, useRef } from 'react';
import { Download, Fullscreen, LoaderCircle, SquareDashedMousePointer, Trash2, X } from 'lucide-react';
import { parcelLookup } from '@/modules';
import { useParcelStore, type ParcelEntry } from '@/state/parcels';
import { MAX_PARCELS, useMapStore } from '@/state/store';
import { formatArea } from '@/map/format';
import { parcelsExtent } from '@/map/parcels';
import { downloadParcels, type ExportFormat, type ExportedParcel } from '@/map/exportParcels';
import { t } from '@/i18n';

const FORMATS: [ExportFormat, string][] = [
  ['geojson', 'GeoJSON'],
  ['kml', 'KML'],
  ['csv', 'CSV'],
];

const action =
  'inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-sm hover:bg-[var(--hover)] disabled:opacity-50 disabled:hover:bg-transparent';

/** What a row says of a parcel: its number, precinct and area, or why there is none. */
function describe(entry: ParcelEntry | undefined): string {
  if (!entry || entry.status === 'loading') return t('parcels.loading');
  if (entry.status === 'missing') return t('parcels.missing');
  if (entry.status === 'error') return t('parcels.error');
  return t('parcels.row', { number: entry.parcel.number, region: entry.parcel.region, area: formatArea(entry.area) });
}

/**
 * The parcel selection: the parcels added from the search or by clicking the map (map/parcels.ts),
 * numbered as on the map, with their total area from the geometry, a way to remove each, to show
 * them all and to save them as a file. Its link is the view's link (`dz`). On a phone the panel
 * is a sheet across the bottom, the map above free to click.
 */
export function ParcelsPanel() {
  const open = useMapStore((m) => m.tool === 'parcels');
  const ids = useMapStore((m) => m.parcels);
  const entries = useParcelStore((s) => s.entries);
  const message = useParcelStore((s) => s.message);
  const { setTool, removeParcel, clearParcels, focusOn } = useMapStore.getState();
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  if (!open || !parcelLookup) return null;

  const found = ids.flatMap((p) => {
    const entry = entries[p];
    return entry?.status === 'ready' ? [{ parcel: entry.parcel, geometry: entry.geometry, area: entry.area } satisfies ExportedParcel] : [];
  });
  const total = found.reduce((sum, p) => sum + p.area, 0);
  /**
   * The parcels in the part of the map this panel leaves free: right of it on a computer, above it
   * on a phone, under the search bar and left of the tools.
   */
  const showAll = () => {
    const extent = parcelsExtent();
    const box = panel.current?.getBoundingClientRect();
    if (!extent || !box) return;
    const sheet = box.top > window.innerHeight / 3;
    const padding: [number, number, number, number] = sheet
      ? [88, 72, window.innerHeight - box.top + 16, 16]
      : [88, 80, 48, box.right + 24];
    focusOn({ extent: extent as [number, number, number, number], zoom: 0, padding });
  };

  return (
    <section
      ref={panel}
      aria-labelledby={`${id}-title`}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 max-h-[60dvh] overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-2 pb-[calc(0.5rem+var(--safe-bottom))] shadow-2xl ring-1 ring-black/5
        sm:inset-x-auto sm:top-[4.75rem] sm:bottom-auto sm:left-4 sm:max-h-[calc(100dvh-7rem)] sm:w-lg sm:rounded-2xl sm:pb-2 sm:shadow-lg"
    >
      <header className="flex items-center gap-2 px-2">
        <SquareDashedMousePointer className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
        <h2 id={`${id}-title`} className="flex-1 text-sm font-semibold">
          {t('parcels.title')}
        </h2>
        <button
          type="button"
          onClick={() => setTool('none')}
          aria-label={t('parcels.end')}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--hover)]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <p className="px-2 text-xs text-[var(--muted)]">
        {t('parcels.hint', { max: MAX_PARCELS })} <span className="phone:hidden">{t('parcels.keys')}</span>
      </p>
      <p role="status" className="px-2 pt-1 text-xs empty:hidden">
        {message}
      </p>

      {ids.length === 0 ? (
        <p className="px-2 pt-2 text-sm">{t('parcels.empty')}</p>
      ) : (
        <>
          <p className="px-2 pt-2 text-sm font-semibold">
            {t('parcels.total', { count: ids.length, max: MAX_PARCELS, area: formatArea(total) })}
          </p>
          <p className="px-2 text-xs text-[var(--muted)]">{t('parcels.areaSource')}</p>
          <ol className="mt-1 flex flex-col">
            {ids.map((parcel, i) => {
              const entry = entries[parcel];
              return (
                <li key={parcel} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-[var(--hover)]">
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--map-selection,#7c3aed)] text-xs font-bold text-white"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">{parcel}</span>
                    <span className="flex items-center gap-1 text-xs text-[var(--muted)]">
                      {entry?.status === 'loading' && <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />}
                      {describe(entry)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeParcel(parcel)}
                    aria-label={t('parcels.remove', { id: parcel })}
                    title={t('parcels.remove', { id: parcel })}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-[var(--surface)]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-1 px-1 pt-2">
            <button type="button" onClick={showAll} disabled={found.length === 0} className={action}>
              <Fullscreen className="h-4 w-4" aria-hidden="true" /> {t('parcels.showAll')}
            </button>
            <span className="flex items-center gap-1" role="group" aria-label={t('parcels.export')}>
              <Download className="ml-1 h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
              {FORMATS.map(([format, name]) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => downloadParcels(found, format)}
                  disabled={found.length === 0}
                  aria-label={t('parcels.exportAs', { format: name })}
                  className={action}
                >
                  {name}
                </button>
              ))}
            </span>
            <button type="button" onClick={clearParcels} className={`${action} ml-auto`}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> {t('parcels.clear')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
