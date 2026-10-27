import { useEffect, useState } from 'react';
import { Hourglass, X } from 'lucide-react';
import { overlayDef } from '@/services/catalog';
import { useStatusStore } from '@/services/status';
import { useMapStore } from '@/state/store';
import { t } from '@/i18n';

/**
 * One quiet line on the map naming the layers switched on whose data is long in coming
 * (services/slow.ts), so a slow service is not taken for an empty map. It goes by itself once
 * the data arrives; closed, it stays away until another layer becomes slow or all have arrived.
 */
export function SlowNotice() {
  const slow = useStatusStore((s) => s.slow);
  const overlays = useMapStore((m) => m.overlays);
  const [closed, setClosed] = useState<string[]>([]);
  const titles = slow.filter((id) => overlays.includes(id)).flatMap((id) => overlayDef(id)?.title ?? []);
  const shown = titles.length > 0 && titles.some((title) => !closed.includes(title));
  // Once all have arrived, a later wait is news again.
  useEffect(() => {
    if (titles.length === 0) setClosed([]);
  }, [titles.length]);

  return (
    // The live region stays in the page, so the line is read out when it appears.
    <div role="status" className={shown ? 'slow-notice pointer-events-auto absolute z-20' : 'sr-only'}>
      {shown && (
        <div className="flex max-w-full items-center gap-2 rounded-2xl bg-[var(--surface)] py-1 pr-1 pl-3 text-xs shadow-lg ring-1 ring-black/5">
          <Hourglass className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <span className="min-w-0">{t('layers.slow', { titles: titles.join(', ') })}</span>
          <button
            type="button"
            onClick={() => setClosed(titles)}
            aria-label={t('common.close')}
            title={t('common.close')}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-[var(--hover)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
