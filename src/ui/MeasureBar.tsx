import { Pentagon, Ruler, Trash2, X } from 'lucide-react';
import { useMapStore, type Tool } from '@/state/store';

const MODES: { tool: Tool; label: string; Icon: typeof Ruler }[] = [
  { tool: 'measure-line', label: 'Odległość', Icon: Ruler },
  { tool: 'measure-area', label: 'Powierzchnia', Icon: Pentagon },
];

/** Controls of the measurement tool, shown while it is active. */
export function MeasureBar() {
  const tool = useMapStore((m) => m.tool);
  const result = useMapStore((m) => m.measureResult);
  const setTool = useMapStore((m) => m.setTool);
  const clear = useMapStore((m) => m.clearMeasurements);
  if (tool === 'none') return null;

  return (
    <section
      aria-label="Pomiar"
      className="pointer-events-auto absolute top-[4.25rem] left-3 z-30 max-w-[calc(100%-5.5rem)] rounded-2xl bg-[var(--surface)] p-2 shadow-lg ring-1 ring-black/5 sm:top-[4.75rem] sm:left-4 sm:max-w-md"
    >
      <div className="flex flex-wrap items-center gap-1">
        {MODES.map(({ tool: t, label, Icon }) => (
          <button
            key={t}
            type="button"
            aria-pressed={tool === t}
            onClick={() => setTool(t)}
            className={`flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-sm transition ${
              tool === t ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'hover:bg-[var(--hover)]'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
        <button type="button" onClick={clear} className="flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-sm hover:bg-[var(--hover)]">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Wyczyść
        </button>
        <button
          type="button"
          onClick={() => setTool('none')}
          aria-label="Zakończ pomiar"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--hover)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="px-2 pt-1 text-xs text-[var(--muted)]">
        Klikaj kolejne punkty na mapie. Dwuklik kończy pomiar, Esc anuluje rysowany kształt.
      </p>
      <p role="status" className="px-2 pt-1 text-sm font-medium empty:hidden">
        {result && `Wynik: ${result}`}
      </p>
    </section>
  );
}
