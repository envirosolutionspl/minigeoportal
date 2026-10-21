import { useEffect, useId, useRef, useState } from 'react';
import { create } from 'zustand';
import { LoaderCircle, Printer, X } from 'lucide-react';
import { BASE_MAPS, OVERLAY_BY_ID, selectedSublayers } from '@/services/registry';
import { layerMeta } from '@/services/meta';
import { useMapStore } from '@/state/store';
import { formatCoordinate } from '@/map/format';
import { PRINT_SCALES, nearestPrintScale, printLayout, type Orientation, type Paper } from '@/map/print';
import { APP_DOMAIN, APP_NAME } from './Brand';

const scaleText = (scale: number) => `1:${scale.toLocaleString('pl-PL')}`;

export const usePrintDialog = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Print settings; printing itself happens in the map (see map/print.ts). */
export function PrintDialog() {
  const open = usePrintDialog((s) => s.open);
  const setOpen = usePrintDialog((s) => s.setOpen);
  const printing = useMapStore((m) => m.printRequest !== null);
  const requestPrint = useMapStore((m) => m.requestPrint);
  const dialog = useRef<HTMLDialogElement>(null);
  const started = useRef(false);
  const [title, setTitle] = useState('');
  const [paper, setPaper] = useState<Paper>('A4');
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [scale, setScale] = useState(1000);
  const id = useId();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setScale(nearestPrintScale(useMapStore.getState().scale));
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  // Closes once the browser's print dialog has been closed.
  useEffect(() => {
    if (printing) started.current = true;
    else if (started.current) {
      started.current = false;
      setOpen(false);
    }
  }, [printing, setOpen]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    requestPrint({ paper, orientation, scale, title: title.trim() });
  };

  const field = 'w-full rounded-xl bg-[var(--field)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
  const choice = (checked: boolean) =>
    `flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-xl px-3 text-sm ring-1 ring-[var(--hover)] has-focus-visible:ring-2 has-focus-visible:ring-[var(--accent)] ${
      checked ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'hover:bg-[var(--hover)]'
    }`;

  return (
    <dialog
      ref={dialog}
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === dialog.current && !printing && setOpen(false)}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-3xl bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl outline-none backdrop:bg-[#253326]/50"
    >
      <form onSubmit={submit} className="space-y-4 p-6 text-sm">
        <header className="flex items-center gap-3">
          <Printer className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          <h2 id={`${id}-title`} className="flex-1 text-lg font-bold">
            Drukuj mapę
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Zamknij" className="rounded-full p-2 hover:bg-[var(--hover)]">
            <X className="h-5 w-5" />
          </button>
        </header>
        <label className="block">
          <span className="mb-1 block font-medium">Tytuł (opcjonalnie)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={field} />
        </label>
        <fieldset>
          <legend className="mb-1 font-medium">Format</legend>
          <div className="flex gap-2">
            {(['A4', 'A3'] as const).map((p) => (
              <label key={p} className={choice(paper === p)}>
                <input type="radio" name="paper" value={p} checked={paper === p} onChange={() => setPaper(p)} className="sr-only" />
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
              <label key={o} className={choice(orientation === o)}>
                <input type="radio" name="orientation" value={o} checked={orientation === o} onChange={() => setOrientation(o)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1 block font-medium">Skala</span>
          <select value={scale} onChange={(e) => setScale(Number(e.target.value))} className={field}>
            {PRINT_SCALES.map((s) => (
              <option key={s} value={s}>
                {scaleText(s)}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[var(--muted)]">
          Wydruk obejmuje środek obecnego widoku. Aby zapisać plik, wybierz w oknie drukowania „Zapisz jako PDF”. Skala
          zgadza się przy druku bez dopasowania do strony (100%).
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
    </dialog>
  );
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
  const center = useMapStore((m) => m.center);
  const layout = request ? printLayout(request) : null;

  const layers = overlays.flatMap((id) => {
    const def = OVERLAY_BY_ID.get(id);
    if (!def) return [];
    return [{ def, names: selectedSublayers(def, sublayers) }];
  });
  const legends = layers.flatMap(({ def, names }) =>
    names.flatMap((name) => {
      const url = layerMeta(def.id, name)?.legend;
      return url ? [{ key: `${def.id}-${name}`, url, label: def.sublayers.find((l) => l.name === name)?.title ?? name }] : [];
    }),
  );

  return (
    <div id="print-sheet" aria-hidden="true">
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
            <strong>Skala {scaleText(request.scale)}</strong> · {new Date().toLocaleDateString('pl-PL')} · środek: {formatCoordinate(center)}
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
