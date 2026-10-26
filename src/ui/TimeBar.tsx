import { useEffect, useId, useState } from 'react';
import { ChevronLeft, ChevronRight, Columns2, LoaderCircle, RotateCw, X, ZoomIn } from 'lucide-react';
import { config, overlayById } from '@/config/runtime';
import { t } from '@/i18n';
import { dateText } from '@/map/format';
import { timeLayerDrawsAt } from '@/map/timeTravel';
import { timeOptionsAt, type TimeOption } from '@/modules';
import { timeValues, valueAt, yearly } from '@/services/time';
import { useMapStore } from '@/state/store';

/** After the map stops, before the dates at its new centre are asked for. */
const SETTLE_MS = 700;
/** Scale the "zoom in" button goes to. */
const ZOOM_SCALE = 20000;

const TIME = config.map.timeTravel;

/**
 * The time view's bar (map.yaml: timeTravel): a slider over the dates the layer has at the
 * centre of the map, buttons to the date before and after (also for keyboards and for
 * anyone who cannot drag), what is shown or loading, and a hint when the map is too far out
 * for the layer to draw. At the foot of the map on a phone, in the middle on wider screens.
 */
export function TimeBar() {
  const tool = useMapStore((m) => m.tool);
  const def = TIME && overlayById.get(TIME.layer);
  if (tool !== 'time' || !def) return null;
  return <Bar id={def.id} title={def.title} />;
}

/** The date as its year, for the ends of the slider and beside it. */
const year = (value: string) => value.slice(0, 4);

const action = 'inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-medium text-[var(--accent)] hover:bg-[var(--hover)]';
const step =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-[var(--hover)] disabled:opacity-40 disabled:hover:bg-transparent';

function Bar({ id, title }: { id: string; title: string }) {
  const spec = timeValues(overlayById.get(id)!);
  const time = useMapStore((m) => m.time);
  const setTime = useMapStore((m) => m.setTime);
  const status = useMapStore((m) => m.timeStatus);
  const retry = useMapStore((m) => m.retryTime);
  const setTool = useMapStore((m) => m.setTool);
  const compare = useMapStore((m) => m.compare);
  const setCompare = useMapStore((m) => m.setCompare);
  const zoomToScale = useMapStore((m) => m.zoomToScale);
  const scale = useMapStore((m) => m.scale);
  const center = useMapStore((m) => m.center);
  /** The dates a module knows at the centre; null until it answers (or without a module). */
  const [options, setOptions] = useState<TimeOption[] | null>(null);
  const [checking, setChecking] = useState(timeOptionsAt !== undefined);
  const sliderId = useId();
  const listId = useId();

  // Asked once the map has settled; a move of less than 100 m stays on the same photos.
  const place = `${Math.round(center[0] / 100)},${Math.round(center[1] / 100)}`;
  useEffect(() => {
    if (!timeOptionsAt) return;
    const ask = timeOptionsAt;
    const controller = new AbortController();
    setChecking(true);
    const timer = window.setTimeout(() => {
      ask(center, controller.signal)
        .then((list) => setOptions(list))
        .catch(() => undefined)
        .finally(() => !controller.signal.aborted && setChecking(false));
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // The centre is read when the place changes, not on every move within it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  const values = options?.map((o) => o.value) ?? yearly(spec?.values ?? []);
  const draws = timeLayerDrawsAt(scale);
  const current = values.length > 0 ? valueAt(values, time ?? spec?.current ?? values[values.length - 1]) : undefined;
  const index = current ? values.indexOf(current) : -1;
  // The date in the link is one the slider holds, so what is shown and what is shared agree;
  // not before the module has answered, when the slider still holds the layer's own values.
  const ready = options !== null || !checking;
  useEffect(() => {
    if (ready && current !== undefined && current !== time) setTime(current);
  }, [ready, current, time, setTime]);

  const choose = (i: number) => setTime(values[Math.min(Math.max(i, 0), values.length - 1)]);
  const label = (value: string) => {
    const shown = t('time.shown', { date: dateText(value) });
    const detail = options?.find((o) => o.value === value)?.detail;
    return detail ? `${shown}, ${detail}` : shown;
  };

  let line: React.ReactNode;
  if (!draws) {
    line = (
      <>
        {t('time.zoomHint', { title })}{' '}
        <button type="button" onClick={() => zoomToScale(ZOOM_SCALE)} className={action}>
          <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> {t('info.zoomIn')}
        </button>
      </>
    );
  } else if (checking && options === null) {
    line = (
      <>
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {t('time.checking')}
      </>
    );
  } else if (!current) {
    line = t('time.none');
  } else if (status === 'error') {
    line = (
      <>
        {t('time.error')}{' '}
        <button type="button" onClick={retry} className={action}>
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> {t('time.retry')}
        </button>
      </>
    );
  } else if (status === 'loading') {
    line = (
      <>
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {t('time.loading', { date: dateText(current) })}
      </>
    );
  } else {
    line = compare ? `${label(current)} · ${t('time.curtainHint')}` : label(current);
  }

  return (
    <section
      aria-label={t('time.title')}
      className="time-bar pointer-events-auto absolute z-30 bg-[var(--surface)] p-2 shadow-lg ring-1 ring-black/5"
    >
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => choose(index - 1)} disabled={index <= 0} aria-label={t('time.earlier')} className={step}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col px-1">
          <input
            id={sliderId}
            type="range"
            min={0}
            max={Math.max(values.length - 1, 0)}
            step={1}
            value={Math.max(index, 0)}
            disabled={values.length === 0}
            list={listId}
            aria-label={t('time.date')}
            aria-valuetext={current ? dateText(current) : ''}
            onChange={(e) => choose(Number(e.target.value))}
            className="time-slider w-full accent-[var(--accent)]"
          />
          <datalist id={listId}>
            {values.map((v, i) => (
              <option key={v} value={i} label={i === 0 || i === values.length - 1 ? year(v) : undefined} />
            ))}
          </datalist>
          <div className="flex justify-between text-[11px] text-[var(--muted)] tabular-nums" aria-hidden="true">
            <span>{values[0] ? year(values[0]) : ''}</span>
            <span>{values.length > 1 ? year(values[values.length - 1]) : ''}</span>
          </div>
        </div>
        <span aria-hidden="true" className="w-12 shrink-0 text-center text-lg font-semibold tabular-nums">
          {current ? year(current) : '–'}
        </span>
        <button
          type="button"
          onClick={() => choose(index + 1)}
          disabled={index < 0 || index >= values.length - 1}
          aria-label={t('time.later')}
          className={step}
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setCompare(!compare)}
          aria-pressed={compare}
          aria-label={t('time.compare')}
          title={t('time.compare')}
          className={`${step} ${compare ? 'bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent)]' : ''}`}
        >
          <Columns2 className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setTool('none')} aria-label={t('time.end')} className={step}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <p role="status" className="flex min-h-5 items-center gap-1.5 px-2 pt-1 text-xs text-[var(--muted)]">
        {line}
      </p>
    </section>
  );
}
