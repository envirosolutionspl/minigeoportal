import { useId } from 'react';
import { Mountain, X } from 'lucide-react';
import { heightsAt } from '@/modules';
import { useMapStore } from '@/state/store';
import { t } from '@/i18n';
import { TerrainProfile } from './TerrainProfile';

/**
 * The terrain profile tool, where a module knows the heights of the terrain: a line drawn on the
 * map (measure.ts) and the profile along it. A new line replaces the last one. On a computer the
 * panel is as wide as the search bar above it, so the chart has room; on a phone it is a sheet
 * across the bottom of the screen, as the print panel, and the map above stays free to draw on.
 */
export function ProfilePanel() {
  const open = useMapStore((m) => m.tool === 'profile');
  const line = useMapStore((m) => m.profileLine);
  const setTool = useMapStore((m) => m.setTool);
  const id = useId();
  if (!open || !heightsAt) return null;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 max-h-[60dvh] overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-2 pb-[calc(0.5rem+var(--safe-bottom))] shadow-2xl ring-1 ring-black/5
        sm:inset-x-auto sm:top-[4.75rem] sm:bottom-auto sm:left-4 sm:max-h-none sm:w-lg sm:rounded-2xl sm:pb-2 sm:shadow-lg"
    >
      <header className="flex items-center gap-2 px-2">
        <Mountain className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
        <h2 id={`${id}-title`} className="flex-1 text-sm font-semibold">
          {t('profile.title')}
        </h2>
        <button
          type="button"
          onClick={() => setTool('none')}
          aria-label={t('profile.end')}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--hover)]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <p className="px-2 text-xs text-[var(--muted)]">{t('profile.hint')}</p>
      <div role="status">{line && <TerrainProfile line={line} heightsAt={heightsAt} />}</div>
    </section>
  );
}
