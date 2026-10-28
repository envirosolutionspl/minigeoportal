import { useId, useState } from 'react';
import { create } from 'zustand';
import { LoaderCircle, SquareDashed, SquareDashedMousePointer, X } from 'lucide-react';
import { dictionary, parcelInPrecinct, type DictEntry, type DictLevel } from './dictionaries';
import type { SearchHit } from '@/search/provider';
import { useMapStore } from '@/state/store';
import { addParcel } from '@/state/parcels';
import { parcelLookup } from '@/modules';
import { zoomForScale } from '@/map/projection';
import { useAbortable } from '@/ui/useAbortable';
import { t } from '@/i18n';
import { PARCEL_SCALE } from './geocoder';

interface Choice {
  woj?: string;
  pow?: string;
  gmi?: string;
  obr?: string;
  number: string;
}

/** The choice survives closing the panel, so the next parcel in the same precinct is one field away. */
const useChoice = create<{ choice: Choice; set(patch: Partial<Choice>): void }>((set) => ({
  choice: { number: '' },
  set: (patch) => set((s) => ({ choice: { ...s.choice, ...patch } })),
}));

interface DictState {
  entries: DictEntry[];
  loading: boolean;
  error: boolean;
  retry(): void;
}

/** Dictionary for one level; empty until its parent is chosen. */
function useDictionary(level: DictLevel, parent: string | undefined, enabled = true): DictState {
  const [attempt, setAttempt] = useState(0);
  const list = useAbortable(() => (enabled ? dictionary(level, parent) : Promise.resolve([])), [level, parent, enabled, attempt]);
  return {
    entries: list.status === 'ready' ? list.value : [],
    loading: list.status === 'loading',
    error: list.status === 'error',
    retry: () => setAttempt((a) => a + 1),
  };
}

/**
 * Parcel search for people who know only the parcel number: voivodeship, county,
 * municipality (or city district) and precinct come from lists, as on geoportal.gov.pl.
 */
/** A parcel number in the land register: a whole number, or two with a slash ("22", "22/1"). */
const PARCEL_NUMBER = /^\d+(\/\d+)?$/;
/** What a parcel number is not made of, dropped as it is typed. */
const NOT_IN_NUMBER = /[^\d/]/g;

export function ParcelSearch({ onClose }: { onClose(): void }) {
  const { choice, set } = useChoice();
  const focusOn = useMapStore((m) => m.focusOn);
  const clearFocus = useMapStore((m) => m.clearFocus);
  /** After a parcel is found the form folds into a summary, so it does not cover the parcel. */
  const [shown, setShown] = useState<SearchHit | null>(null);
  const woj = useDictionary('wojewodztwa', '');
  const pow = useDictionary('powiaty', choice.woj, !!choice.woj);
  const gmi = useDictionary('gminy', choice.pow, !!choice.pow);
  const obr = useDictionary('obreby', choice.gmi, !!choice.gmi);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<'idle' | 'busy' | 'none' | 'error'>('idle');
  const id = useId();

  const precinct = obr.entries.find((e) => e.id === choice.obr);
  const ready = !!precinct && PARCEL_NUMBER.test(choice.number);

  const show = (hit: SearchHit) => {
    focusOn({ wkt: hit.wkt, zoom: zoomForScale(PARCEL_SCALE), persist: true, parcel: hit.id });
    setShown(hit);
  };

  if (shown) {
    return (
      <section
        aria-label={t('parcel.found')}
        className="absolute inset-x-0 mt-2 flex items-center gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3 shadow-lg ring-1 ring-black/5"
      >
        <SquareDashed className="h-5 w-5 shrink-0 text-[var(--highlight-ui,var(--highlight))]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{shown.label}</p>
          <p className="truncate text-xs text-[var(--muted)]">{shown.detail}</p>
        </div>
        {parcelLookup && shown.id && (
          <button
            type="button"
            onClick={() => {
              addParcel(shown.id!);
              useMapStore.getState().setTool('parcels');
              onClose();
            }}
            aria-label={t('parcels.add')}
            title={t('parcels.add')}
            className="rounded-full p-2.5 text-[var(--accent)] hover:bg-[var(--hover)]"
          >
            <SquareDashedMousePointer className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setShown(null)}
          className="rounded-xl px-2.5 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--hover)]"
        >
          {t('parcel.change')}
        </button>
        <button
          type="button"
          onClick={() => {
            clearFocus();
            onClose();
          }}
          aria-label={t('parcel.clearAndClose')}
          className="rounded-full p-2.5 hover:bg-[var(--hover)]"
        >
          <X className="h-4 w-4" />
        </button>
      </section>
    );
  }

  const submit = async () => {
    if (!precinct) return;
    setStatus('busy');
    setHits([]);
    try {
      const found = await parcelInPrecinct(precinct, choice.number, AbortSignal.timeout(20000));
      setHits(found);
      setStatus(found.length > 0 ? 'idle' : 'none');
      if (found.length === 1) show(found[0]);
    } catch {
      setStatus('error');
    }
  };

  return (
    <section
      aria-label={t('parcel.panel')}
      // Never taller than the screen below the search bar: a phone held sideways scrolls the form.
      className="absolute inset-x-0 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl bg-[var(--surface)] p-4 shadow-lg ring-1 ring-black/5"
    >
      <header className="mb-3 flex items-center gap-2">
        <SquareDashed className="h-5 w-5 text-[var(--accent)]" />
        <h2 className="flex-1 text-sm font-semibold">{t('parcel.title')}</h2>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-full p-2.5 hover:bg-[var(--hover)]">
          <X className="h-4 w-4" />
        </button>
      </header>

      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        <Select
          label={t('parcel.voivodeship')}
          value={choice.woj}
          state={woj}
          onChange={(v) => set({ woj: v, pow: undefined, gmi: undefined, obr: undefined })}
        />
        <Select
          label={t('parcel.county')}
          value={choice.pow}
          state={pow}
          disabled={!choice.woj}
          onChange={(v) => set({ pow: v, gmi: undefined, obr: undefined })}
        />
        <Select
          label={t('parcel.commune')}
          value={choice.gmi}
          state={gmi}
          disabled={!choice.pow}
          onChange={(v) => set({ gmi: v, obr: undefined })}
        />
        <Select label={t('parcel.precinct')} value={choice.obr} state={obr} disabled={!choice.gmi} onChange={(v) => set({ obr: v })} />
        <label className="col-span-2 flex flex-col gap-1 text-xs text-[var(--muted)]">
          {t('parcel.number')}
          {/* Only what a parcel number in the land register is made of: digits, and a slash between two numbers. */}
          <input
            value={choice.number}
            onChange={(e) => set({ number: e.target.value.replace(NOT_IN_NUMBER, '') })}
            placeholder={t('parcel.numberPlaceholder')}
            aria-describedby={`${id}-number-hint`}
            inputMode="text"
            autoComplete="off"
            className="rounded-xl bg-[var(--field)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <span id={`${id}-number-hint`} className="sr-only">
            {t('parcel.numberHint')}
          </span>
        </label>
        <button
          type="submit"
          disabled={!ready || status === 'busy'}
          className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)] transition enabled:hover:brightness-110 disabled:opacity-40"
        >
          {status === 'busy' && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {t('parcel.search')}
        </button>
      </form>

      <div role="status">
        {status === 'none' && (
          <p className="mt-3 text-sm text-[var(--muted)]">
            {t('parcel.notFound', { number: choice.number, precinct: precinct?.name ?? '' })}
          </p>
        )}
        {status === 'error' && <p className="mt-3 text-sm text-[var(--muted)]">{t('parcel.error')}</p>}
        {hits.length > 1 && <p className="sr-only">{t('parcel.several', { count: hits.length })}</p>}
      </div>
      {hits.length > 1 && (
        <ul className="mt-3 flex flex-col gap-1">
          {hits.map((h) => (
            <li key={h.detail}>
              <button
                type="button"
                onClick={() => show(h)}
                className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--hover)]"
              >
                {h.label}
                <span className="block text-xs text-[var(--muted)]">{h.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hits.length === 1 && <p className="mt-3 text-xs text-[var(--muted)]">{hits[0].detail}</p>}
    </section>
  );
}

function Select({
  label,
  value,
  state,
  disabled,
  onChange,
}: {
  label: string;
  value: string | undefined;
  state: DictState;
  disabled?: boolean;
  onChange(value: string): void;
}) {
  const placeholder = state.loading ? t('common.loading') : state.error ? t('parcel.listFailed') : t('parcel.choose');
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-[var(--muted)]">
      <span className="flex items-center justify-between">
        {label}
        {state.error && (
          // Outside the label's control: a button inside a label would also toggle the field.
          <span role="presentation" className="contents">
            <button
              type="button"
              onClick={state.retry}
              aria-label={t('parcel.retryList', { label })}
              className="text-[var(--accent)] underline"
            >
              {t('parcel.retry')}
            </button>
          </span>
        )}
      </span>
      <select
        aria-label={label}
        value={value ?? ''}
        disabled={disabled || state.loading}
        onChange={(e) => onChange(e.target.value)}
        className="w-full truncate rounded-xl bg-[var(--field)] px-2.5 py-2 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {state.entries.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </label>
  );
}
