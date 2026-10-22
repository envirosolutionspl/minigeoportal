import { useId, useState } from 'react';
import { create } from 'zustand';
import { Bug, LoaderCircle, X } from 'lucide-react';

import { config } from '@/config/runtime';
import { EMAIL_MAX, MESSAGE } from '../../shared/report';
import { useModalDialog } from './useModalDialog';
import { t } from '@/i18n';

const MIN = MESSAGE.min;
const MAX = MESSAGE.max;

/** Open state is shared so the info dialog and the place panel can open the form. */
export const useReport = create<{ open: boolean; draft: string; openReport(draft?: string): void; close(): void }>((set) => ({
  open: false,
  draft: '',
  openReport: (draft = '') => set({ open: true, draft }),
  close: () => set({ open: false }),
}));

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

/** What a refused report means, by the server's status code. */
const REFUSAL: Record<number, string> = { 400: 'report.invalid', 413: 'report.tooLong', 429: 'report.tooMany', 503: 'report.off' };

/** Key of the message for a refusal: the field the server names, else what its status means. */
async function refusal(res: Response): Promise<string> {
  const { error } = (await res.json().catch(() => ({}))) as { error?: string };
  const key = `report.error.${error}`;
  return error && t(key) !== key ? key : (REFUSAL[res.status] ?? 'report.failed');
}

/** Bug report form; the server sends it by e-mail to the administrator. */
export function ReportDialog() {
  const open = useReport((s) => s.open);
  const draft = useReport((s) => s.draft);
  const close = useReport((s) => s.close);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const id = useId();

  // Opening takes the draft the place panel may have left, and asks whether the form is on.
  const { ref, onBackdropClick } = useModalDialog(open, close, () => {
    setMessage(draft);
    setState({ kind: 'idle' });
    fetch('/api/report')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((r: { enabled: boolean }) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  });

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category: form.get('category'),
          message,
          email: form.get('email'),
          view: form.get('attachView') ? location.href : undefined,
          website: form.get('website'),
        }),
      });
      // The server explains a refusal in Polish; the form says it in the visitor's language.
      if (res.ok) setState({ kind: 'sent' });
      else setState({ kind: 'error', message: t(await refusal(res)) });
    } catch {
      setState({ kind: 'error', message: t('report.offline') });
    }
  };

  const field =
    'w-full rounded-xl bg-[var(--field)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
  const length = message.trim().length;

  return (
    <>
      {/* The backdrop is the dialog itself; Escape closes it natively (see useModalDialog). */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={ref}
        onClose={close}
        onClick={onBackdropClick}
        aria-labelledby={`${id}-title`}
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-3xl bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl outline-none backdrop:bg-[#253326]/50"
      >
        <div className="max-h-[85dvh] overflow-y-auto p-6">
          <header className="mb-4 flex items-center gap-3">
            <Bug className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
            <h2 id={`${id}-title`} className="flex-1 text-lg font-bold">
              {t('report.title')}
            </h2>
            <button type="button" onClick={close} aria-label={t('common.close')} className="rounded-full p-2 hover:bg-[var(--hover)]">
              <X className="h-5 w-5" />
            </button>
          </header>

          {state.kind === 'sent' ? (
            <div role="status" className="space-y-4 text-sm">
              <p>{t('report.sent')}</p>
              <button
                type="button"
                onClick={close}
                className="rounded-2xl bg-[var(--accent)] px-5 py-2.5 font-semibold text-[var(--on-accent)]"
              >
                {t('common.close')}
              </button>
            </div>
          ) : enabled === false ? (
            <p role="status" className="text-sm">
              {t('report.off')}
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4 text-sm">
              <p className="text-[var(--muted)]">{t('report.intro')}</p>
              <label className="block">
                <span className="mb-1 block font-medium">{t('report.category')}</span>
                <select name="category" required defaultValue="mapa" className={field}>
                  {config.report.categories.map(({ id: value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <label htmlFor={`${id}-message`} className="mb-1 block font-medium">
                  {t('report.message')}
                </label>
                <textarea
                  id={`${id}-message`}
                  name="message"
                  required
                  minLength={MIN}
                  maxLength={MAX}
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-describedby={`${id}-count`}
                  className={field}
                />
                <p id={`${id}-count`} className="mt-1 text-xs text-[var(--muted)]">
                  {length < MIN ? t('report.atLeast', { count: MIN }) : t('report.length', { length, count: MAX })}
                </p>
              </div>
              <label className="block">
                <span className="mb-1 block font-medium">{t('report.email')}</span>
                <input name="email" type="email" autoComplete="email" maxLength={EMAIL_MAX} className={field} />
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input name="attachView" type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                <span>{t('report.attachView')}</span>
              </label>
              {/* Hidden from people; bots that fill it in are ignored by the server. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label>
                  Strona www <input name="website" type="text" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              <p className="text-xs text-[var(--muted)]">{t('report.privacy')}</p>
              <div aria-live="polite" className="empty:hidden">
                {state.kind === 'error' && (
                  <p className="rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-[var(--danger)]">{state.message}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={state.kind === 'sending' || length < MIN}
                className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-2.5 font-semibold text-[var(--on-accent)] disabled:opacity-50"
              >
                {state.kind === 'sending' && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {t('report.send')}
              </button>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
