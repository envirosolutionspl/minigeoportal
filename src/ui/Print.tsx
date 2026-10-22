import { useEffect, useId, useRef } from 'react';
import { LoaderCircle, Printer, X } from 'lucide-react';
import { BASE_MAPS, selectedSublayers, type Overlay } from '@/services/registry';
import { overlayDef } from '@/services/catalog';
import { layerMeta, visibleAtScale } from '@/services/meta';
import { useMapStore } from '@/state/store';
import { formatCoordinate, scaleText } from '@/map/format';
import { PRINT_SCALES, SHEET_VARS, printLayout, serverScale, type PrintOptions } from '@/map/print';
import { APP_DOMAIN, APP_NAME } from './Brand';

/**
 * Print settings, beside the map rather than over it: the map shows the printed area and can
 * be moved to frame it. Printing itself happens in the map (see map/print.ts).
 */
export function PrintPanel() {
  const open = useMapStore((m) => m.tool === 'print');
  const settings = useMapStore((m) => m.printSettings);
  const printing = useMapStore((m) => m.printRequest !== null);
  const { setPrintSettings, requestPrint, setTool } = useMapStore.getState();
  const started = useRef(false);
  const title = useRef<HTMLInputElement>(null);
  const id = useId();

  // The focus goes to the form when it opens.
  useEffect(() => {
    if (open) title.current?.focus();
  }, [open]);

  // Closes once the browser's print dialog has been closed.
  useEffect(() => {
    if (printing) started.current = true;
    else if (started.current) {
      started.current = false;
      setTool('none');
    }
  }, [printing, setTool]);

  if (!open) return null;

  const set = (s: Partial<PrintOptions>) => setPrintSettings(s);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    requestPrint({ ...settings, title: settings.title.trim() });
  };

  const field = 'w-full rounded-xl bg-[var(--field)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
  const choice = (checked: boolean) =>
    `flex min-h-9 flex-1 cursor-pointer items-center justify-center rounded-xl px-3 text-sm ring-1 ring-[var(--hover)] has-focus-visible:ring-2 has-focus-visible:ring-[var(--accent)] ${
      checked ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'hover:bg-[var(--hover)]'
    }`;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 max-h-[60dvh] overflow-y-auto rounded-t-3xl bg-[var(--surface)] shadow-2xl
        sm:inset-x-auto sm:top-[4.75rem] sm:bottom-auto sm:left-4 sm:max-h-[calc(100dvh-7rem)] sm:w-80 sm:rounded-2xl"
    >
      <form onSubmit={submit} className="space-y-3 p-4 text-sm">
        <header className="flex items-center gap-2">
          <Printer className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
          <h2 id={`${id}-title`} className="flex-1 text-base font-semibold">
            Drukuj mapę
          </h2>
          <button type="button" onClick={() => setTool('none')} aria-label="Zamknij" className="rounded-full p-2 hover:bg-[var(--hover)]">
            <X className="h-5 w-5" />
          </button>
        </header>
        <p className="text-xs text-[var(--muted)]">
          Pomarańczowa ramka na mapie pokazuje obszar wydruku. Przesuń mapę, aby go ustawić.
        </p>
        <label className="block">
          <span className="mb-1 block font-medium">Tytuł (opcjonalnie)</span>
          <input ref={title} value={settings.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} className={field} />
        </label>
        <fieldset>
          <legend className="mb-1 font-medium">Format</legend>
          <div className="flex gap-2">
            {(['A4', 'A3'] as const).map((p) => (
              <label key={p} className={choice(settings.paper === p)}>
                <input type="radio" name="paper" value={p} checked={settings.paper === p} onChange={() => set({ paper: p })} className="sr-only" />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 font-medium">Orientacja</legend>
          <div className="flex gap-2">
            {(
              [
                ['landscape', 'Pozioma'],
                ['portrait', 'Pionowa'],
              ] as const
            ).map(([o, label]) => (
              <label key={o} className={choice(settings.orientation === o)}>
                <input
                  type="radio"
                  name="orientation"
                  value={o}
                  checked={settings.orientation === o}
                  onChange={() => set({ orientation: o })}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1 block font-medium">Skala</span>
          <select value={settings.scale} onChange={(e) => set({ scale: Number(e.target.value) })} className={field}>
            {PRINT_SCALES.map((s) => (
              <option key={s} value={s}>
                {scaleText(s)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[var(--muted)]">
          Aby zapisać plik, wybierz w oknie drukowania „Zapisz jako PDF”. Skala zgadza się przy druku bez dopasowania do
          strony (100%).
        </p>
        <button
          type="submit"
          disabled={printing}
          className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-2.5 font-semibold text-[var(--on-accent)] disabled:opacity-60"
        >
          {printing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Printer className="h-4 w-4" aria-hidden="true" />}
          {printing ? 'Przygotowuję wydruk…' : 'Drukuj'}
        </button>
        <p role="status" className="sr-only">
          {printing ? 'Przygotowuję wydruk, wczytuję mapę.' : ''}
        </p>
      </form>
    </section>
  );
}

/**
 * Overlays and their sublayers that the printed map actually shows: switched on and drawn by
 * their server at the print scale. Layers visible only at other scales stay off the legend.
 */
export function printedLayers(
  overlays: string[],
  sublayers: Record<string, string[]>,
  options: Pick<PrintOptions, 'paper' | 'orientation' | 'scale'>,
): { def: Overlay; names: string[] }[] {
  const scale = serverScale(options);
  return overlays.flatMap((id) => {
    const def = overlayDef(id);
    if (!def) return [];
    const names = selectedSublayers(def, sublayers).filter((name) => visibleAtScale(id, name, scale));
    return names.length > 0 ? [{ def, names }] : [];
  });
}

/**
 * The printed sheet: title, map frame, scale, date, layers with legends and sources. It is laid
 * out off screen while printing and is the only thing on the printed page.
 */
export function PrintSheet() {
  const request = useMapStore((m) => m.printRequest);
  const base = useMapStore((m) => m.base);
  const overlays = useMapStore((m) => m.overlays);
  const sublayers = useMapStore((m) => m.sublayers);
  // Read only while printing, so map moves do not re-render the sheet.
  const center = useMapStore((m) => (m.printRequest ? (m.printCenter ?? m.center) : null));
  const layout = request ? printLayout(request) : null;

  const layers = request ? printedLayers(overlays, sublayers, request) : [];
  const legends = layers.flatMap(({ def, names }) =>
    names.flatMap((name) => {
      const url = layerMeta(def.id, name)?.legend;
      return url ? [{ key: `${def.id}-${name}`, url, label: def.sublayers.find((l) => l.name === name)?.title ?? name }] : [];
    }),
  );

  return (
    <div id="print-sheet" aria-hidden="true" style={SHEET_VARS}>
      <header className="print-header">
        <strong>{request?.title || 'Mapa'}</strong>
        <span>
          {APP_NAME} · {APP_DOMAIN}
        </span>
      </header>
      <div className="print-frame" style={layout ? ({ '--print-zoom': layout.zoom } as React.CSSProperties) : undefined}>
        <div id="print-map" />
      </div>
      {request && (
        <footer className="print-footer">
          <p>
            <strong>Skala {scaleText(request.scale)}</strong> · {new Date().toLocaleDateString('pl-PL')} · środek: {center && formatCoordinate(center)}
          </p>
          <p>
            Podkład: {BASE_MAPS.find((b) => b.id === base)?.title ?? 'brak'}
            {layers.length > 0 && ` · Warstwy: ${layers.map(({ def }) => def.title).join(', ')}`}
          </p>
          {legends.length > 0 && (
            <div className="print-legend">
              {legends.map((l) => (
                <figure key={l.key}>
                  <img src={l.url} alt="" />
                  <figcaption>{l.label}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <p className="print-note">
            Dane: GUGiK (geoportal.gov.pl), starostwa powiatowe i gminy. Mapa poglądowa, nie jest dokumentem urzędowym.
            Układ współrzędnych PL-1992 (EPSG:2180).
          </p>
        </footer>
      )}
    </div>
  );
}
