import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Columns2, LoaderCircle, RotateCw, X, ZoomIn } from 'lucide-react';
import { config } from '@/config/runtime';
import { t } from '@/i18n';
import { dateText } from '@/map/format';
import { addedAfter, currentTimeLayer, timeLayerDrawsAt, timeLayerReaches, timeLayers } from '@/map/timeTravel';
import { PROJECTION } from '@/map/projection';
import { timeOptions, type TimeOption } from '@/modules';
import { valueAt, yearly, type TimeValues } from '@/services/time';
import { useMapStore } from '@/state/store';

/** After the map stops, before the dates at its new centre are asked for. */
const SETTLE_MS = 700;
/** Scale the "zoom in" button goes to. */
const ZOOM_SCALE = 20000;
/**
 * The middle of the map is asked about on a grid of this many metres: the photos and sheets of
 * the indexes are kilometres wide, and neighbouring points share one answer, which the browser
 * and the server keep.
 */
const GRID_M = 250;
const grid = GRID_M / (PROJECTION.getMetersPerUnit() ?? 1);
const onGrid = ([x, y]: [number, number]): [number, number] => [Math.round(x / grid) * grid, Math.round(y / grid) * grid];

/**
 * The time view's bar (map.yaml: timeTravel): a switch between its layers when there are
 * several, a slider over the dates the layer has at the centre of the map, buttons to the date
 * before and after (also for keyboards and for anyone who cannot drag), what is shown or
 * loading, a hint when the map is too far out for the layer to draw, and a switch for what was
 * added after the date (the buildings built since the photo) where the layer has it. At the foot of the map
 * on a phone, in the middle on wider screens.
 */
export function TimeBar() {
  const tool = useMapStore((m) => m.tool);
  const chosen = useMapStore((m) => m.timeLayer);
  const current = currentTimeLayer(chosen);
  if (tool !== 'time' || !current) return null;
  return <Bar key={current.def.id} id={current.def.id} title={current.def.title} spec={current.spec} />;
}

/** The date as its year, for the ends of the slider and beside it. */
const year = (value: string) => value.slice(0, 4);

const action = 'inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-medium text-[var(--accent)] hover:bg-[var(--hover)]';
const step =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-[var(--hover)] disabled:opacity-40 disabled:hover:bg-transparent';

function Bar({ id, title, spec }: { id: string; title: string; spec: TimeValues }) {
  const time = useMapStore((m) => m.time);
  const setTime = useMapStore((m) => m.setTime);
  const status = useMapStore((m) => m.timeStatus);
  const retry = useMapStore((m) => m.retryTime);
  const setTool = useMapStore((m) => m.setTool);
  const chosen = useMapStore((m) => m.timeLayer);
  const setTimeLayer = useMapStore((m) => m.setTimeLayer);
  const named = useMapStore((m) => m.timeSublayers);
  const setTimeSublayers = useMapStore((m) => m.setTimeSublayers);
  const compare = useMapStore((m) => m.compare);
  const setCompare = useMapStore((m) => m.setCompare);
  const zoomToScale = useMapStore((m) => m.zoomToScale);
  const scale = useMapStore((m) => m.scale);
  const center = useMapStore((m) => m.center);
  const showAdded = useMapStore((m) => m.timeAdded);
  const setShowAdded = useMapStore((m) => m.setTimeAdded);
  /** A module that knows the dates of this layer at a place; without one the slider holds the layer's own values. */
  const ask = timeOptions(id);
  /** The module's last answer and the place it is for; a list of null means it did not answer there. */
  const [answer, setAnswer] = useState<{ place: string; list: TimeOption[] | null } | null>(null);
  const sliderId = useId();
  const listId = useId();
  /** Where the slider is while it is being dragged; the date is asked for once it is let go. */
  const [dragging, setDragging] = useState<number | null>(null);
  const slider = useRef<HTMLInputElement>(null);
  const bar = useRef<HTMLElement>(null);

  // Phones put the zoom buttons above the bar (index.css: --time-bar), whose height follows its text.
  useEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement.style;
    const observer = new ResizeObserver(() => root.setProperty('--time-bar', `${el.offsetHeight}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeProperty('--time-bar');
    };
  }, []);

  // Asked once the map has settled, about the grid point nearest the middle, and only where the
  // layer draws at this scale: nothing is asked over the whole country.
  const point = onGrid(center);
  const place = `${id}|${point.join(',')}`;
  const reaches = timeLayerReaches(chosen, scale);
  useEffect(() => {
    if (!ask || !reaches) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      ask(point, controller.signal)
        .then((list) => setAnswer({ place, list }))
        // An index that did not answer leaves the layer's own values, never another place's dates.
        .catch(() => !controller.signal.aborted && setAnswer({ place, list: null }));
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // The point is read when the place changes, not on every move within it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, reaches]);
  /** The answer is for this place; meanwhile the last place's dates stay on the slider, said to be checked. */
  const fresh = answer?.place === place;
  const checking = ask !== undefined && reaches && !fresh;
  const options = answer?.list ?? null;

  const values = options?.map((o) => o.value) ?? yearly(spec.values);
  const draws = timeLayerDrawsAt(chosen, time, named, scale);
  const current = values.length > 0 ? valueAt(values, time ?? spec.current ?? values[values.length - 1]) : undefined;
  const index = current ? values.indexOf(current) : -1;
  // The date in the link is one the slider holds, so what is shown and what is shared agree;
  // not before the module has answered here, when the slider still holds other values.
  const ready = !ask || fresh;
  useEffect(() => {
    if (ready && current !== undefined && current !== time) setTime(current);
  }, [ready, current, time, setTime]);
  // What the module says draws this date (the sheets at the place), for the map.
  const chosenLayer = fresh && current !== undefined ? (options?.find((o) => o.value === current)?.layer ?? null) : null;
  useEffect(() => {
    setTimeSublayers(chosenLayer);
  }, [chosenLayer, setTimeSublayers]);

  const choose = (i: number) => setTime(values[Math.min(Math.max(i, 0), values.length - 1)]);
  const latest = useRef(values);
  useEffect(() => {
    latest.current = values;
  });
  /**
   * The browser sends input events for every date the thumb passes (React's onChange) and a
   * change event when the slider is let go, or after each key. Only then is the service asked.
   * React drops that change event when the value did not move since the last input event, so
   * the element itself listens for it.
   */
  useEffect(() => {
    const el = slider.current;
    if (!el) return;
    const commit = () => {
      setDragging(null);
      const list = latest.current;
      setTime(list[Math.min(Math.max(Number(el.value), 0), list.length - 1)]);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [setTime]);
  const onSlide = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.nativeEvent.type !== 'change') setDragging(Number(e.target.value));
  };
  const shown = dragging ?? index;
  const dragged = dragging !== null && values[dragging] !== undefined ? values[dragging] : undefined;

  /** What a value is called: an edition's name, else the date, with a module's detail after it. */
  const label = (value: string) => {
    const named = spec.editions?.[value]?.label ?? t('time.shown', { date: dateText(value) });
    const detail = options?.find((o) => o.value === value)?.detail;
    return detail ? `${named}, ${detail}` : named;
  };

  /** What was added in the years after the date shown, when the layer has it and there are such years. */
  const added = current !== undefined ? addedAfter(chosen, current) : undefined;
  const addedYears = added && added.years.length > 0 ? [added.years[0], added.years[added.years.length - 1]] : undefined;

  let line: React.ReactNode;
  if (dragged) {
    line = spec.editions?.[dragged]?.label ?? t('time.pick', { date: dateText(dragged) });
  } else if (!draws) {
    line = (
      <>
        {t('time.zoomHint', { title })}{' '}
        <button type="button" onClick={() => zoomToScale(ZOOM_SCALE)} className={action}>
          <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" /> {t('info.zoomIn')}
        </button>
      </>
    );
  } else if (checking) {
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
      ref={bar}
      aria-label={t('time.title')}
      className="time-bar pointer-events-auto absolute z-30 bg-[var(--surface)] p-2 shadow-lg ring-1 ring-black/5"
    >
      {timeLayers().length > 1 && (
        <div role="group" aria-label={t('time.layers')} className="mb-1 flex gap-1 px-1">
          {(config.map.timeTravel?.layers ?? []).map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === id}
              onClick={() => setTimeLayer(entry.id)}
              className={`min-h-9 flex-1 rounded-xl px-2 text-sm font-medium transition ${
                entry.id === id ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--field)] hover:bg-[var(--hover)]'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => choose(index - 1)} disabled={index <= 0} aria-label={t('time.earlier')} className={step}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col px-1">
          <input
            ref={slider}
            id={sliderId}
            type="range"
            min={0}
            max={Math.max(values.length - 1, 0)}
            step={1}
            value={Math.max(shown, 0)}
            disabled={values.length === 0}
            list={listId}
            aria-label={t('time.date')}
            aria-valuetext={dragged ? dateText(dragged) : current ? dateText(current) : ''}
            onChange={onSlide}
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
          {dragged ? year(dragged) : current ? year(current) : '–'}
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 px-2 pt-1 text-xs">
        <p role="status" className="flex min-h-5 items-center gap-1.5 text-[var(--muted)]">
          {line}
        </p>
        {added && addedYears && (
          <label title={added.def.description} className="flex min-h-8 cursor-pointer items-center gap-1.5 font-medium">
            <input
              type="checkbox"
              checked={showAdded}
              onChange={(e) => setShowAdded(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            {t('time.added', {
              title: added.def.title,
              years: addedYears[0] === addedYears[1] ? addedYears[0] : `${addedYears[0]}–${addedYears[1]}`,
            })}
          </label>
        )}
      </div>
    </section>
  );
}
