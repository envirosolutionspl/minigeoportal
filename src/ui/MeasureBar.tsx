import { Pentagon, Ruler, Trash2, X } from 'lucide-react';
import { useMapStore, type Tool } from '@/state/store';
import { t } from '@/i18n';

const MODES: { tool: Tool; label: string; Icon: typeof Ruler }[] = [
  { tool: 'measure-line', label: t('measure.distance'), Icon: Ruler },
  { tool: 'measure-area', label: t('measure.area'), Icon: Pentagon },
];

/** Controls of the measurement tool, shown while it is active. */
export function MeasureBar() {
  const tool = useMapStore((m) => m.tool);
  const result = useMapStore((m) => m.measureResult);
  const setTool = useMapStore((m) => m.setTool);
  const clear = useMapStore((m) => m.clearMeasurements);
  if (tool !== 'measure-line' && tool !== 'measure-area') return null;

  return (
    <section
      aria-label={t('measure.title')}
      className="pointer-events-auto absolute top-[4.25rem] left-3 z-30 max-w-[calc(100%-5.5rem)] rounded-2xl bg-[var(--surface)] p-2 shadow-lg ring-1 ring-black/5 sm:top-[4.75rem] sm:left-4 sm:max-w-md"
    >
      <div className="flex flex-wrap items-center gap-1">
        {MODES.map(({ tool: mode, label, Icon }) => (
          <button
            key={mode}
            type="button"
            aria-pressed={tool === mode}
            onClick={() => setTool(mode)}
            className="flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-sm transition hover:bg-[var(--hover)] aria-pressed:bg-[var(--accent)] aria-pressed:text-[var(--on-accent)]"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
        <button type="button" onClick={clear} className="flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-sm hover:bg-[var(--hover)]">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t('measure.clear')}
        </button>
        <button
          type="button"
          onClick={() => setTool('none')}
          aria-label={t('measure.end')}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--hover)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* The keys mean nothing to a finger: a phone gets the clicks only. */}
      <p className="px-2 pt-1 text-xs text-[var(--muted)]">
        {t('measure.hint')} <span className="phone:hidden">{t('measure.keys')}</span>
      </p>
      <p role="status" className="px-2 pt-1 text-sm font-medium empty:hidden">
        {result && t('measure.result', { result })}
      </p>
    </section>
  );
}
