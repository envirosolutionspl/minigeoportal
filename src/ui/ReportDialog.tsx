import { useEffect, useId, useRef, useState } from 'react';
import { create } from 'zustand';
import { Bug, LoaderCircle, X } from 'lucide-react';

const CATEGORIES = [
  ['mapa', 'Mapa lub warstwy'],
  ['wyszukiwanie', 'Wyszukiwanie'],
  ['dzialki', 'Działki i informacje o miejscu'],
  ['dostepnosc', 'Dostępność'],
  ['inne', 'Inne'],
] as const;

const MIN = 10;
const MAX = 3000;

/** Open state is shared so the info dialog and the place panel can open the form. */
export const useReport = create<{ open: boolean; draft: string; openReport(draft?: string): void; close(): void }>((set) => ({
  open: false,
  draft: '',
  openReport: (draft = '') => set({ open: true, draft }),
  close: () => set({ open: false }),
}));

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string };

/** Bug report form; the server sends it by e-mail to the administrator. */
export function ReportDialog() {
  const open = useReport((s) => s.open);
  const draft = useReport((s) => s.draft);
  const close = useReport((s) => s.close);
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const id = useId();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      setMessage(draft);
      setState({ kind: 'idle' });
      d.showModal();
      fetch('/api/report')
        .then((r) => (r.ok ? r.json() : { enabled: false }))
        .then((r: { enabled: boolean }) => setEnabled(r.enabled))
        .catch(() => setEnabled(false));
    }
    if (!open && d.open) d.close();
  }, [open, draft]);

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
      if (res.ok) setState({ kind: 'sent' });
      else setState({ kind: 'error', message: (await res.text()) || 'Nie udało się wysłać zgłoszenia.' });
    } catch {
      setState({ kind: 'error', message: 'Brak połączenia z serwerem. Spróbuj ponownie.' });
    }
  };

  const field = 'w-full rounded-xl bg-[var(--field)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
  const length = message.trim().length;

  return (
    <dialog
      ref={dialog}
      onClose={close}
      onClick={(e) => e.target === dialog.current && close()}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-3xl bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl outline-none backdrop:bg-[#253326]/50"
    >
      <div className="max-h-[85dvh] overflow-y-auto p-6">
        <header className="mb-4 flex items-center gap-3">
          <Bug className="h-6 w-6 text-[var(--accent)]" aria-hidden="true" />
          <h2 id={`${id}-title`} className="flex-1 text-lg font-bold">
            Zgłoś błąd w serwisie
          </h2>
          <button type="button" onClick={close} aria-label="Zamknij" className="rounded-full p-2 hover:bg-[var(--hover)]">
            <X className="h-5 w-5" />
          </button>
        </header>

        {state.kind === 'sent' ? (
          <div role="status" className="space-y-4 text-sm">
            <p>Dziękujemy. Zgłoszenie trafiło do administratora serwisu.</p>
            <button type="button" onClick={close} className="rounded-2xl bg-[var(--accent)] px-5 py-2.5 font-semibold text-[var(--on-accent)]">
              Zamknij
            </button>
          </div>
        ) : enabled === false ? (
          <p role="status" className="text-sm">
            Formularz zgłoszeń jest chwilowo niedostępny. Spróbuj ponownie później.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4 text-sm">
            <p className="text-[var(--muted)]">
              Opisz, co nie działa w Prostym Geoportalu. Błędy w samych danych (np. granice działek) zgłasza się
              urzędowi, który je prowadzi.
            </p>
            <label className="block">
              <span className="mb-1 block font-medium">Czego dotyczy</span>
              <select name="category" required defaultValue="mapa" className={field}>
                {CATEGORIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <label htmlFor={`${id}-message`} className="mb-1 block font-medium">
                Opis problemu
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
                {length < MIN ? `Co najmniej ${MIN} znaków.` : `${length} z ${MAX} znaków.`}
              </p>
            </div>
            <label className="block">
              <span className="mb-1 block font-medium">E-mail do odpowiedzi (opcjonalnie)</span>
              <input name="email" type="email" autoComplete="email" maxLength={254} className={field} />
            </label>
            <label className="flex cursor-pointer items-start gap-2">
              <input name="attachView" type="checkbox" defaultChecked className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
              <span>Dołącz adres bieżącego widoku mapy, aby łatwiej odtworzyć problem.</span>
            </label>
            {/* Hidden from people; bots that fill it in are ignored by the server. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                Strona www <input name="website" type="text" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <p className="text-xs text-[var(--muted)]">
              Zgłoszenie wysyłamy e-mailem do administratora serwisu razem z nazwą przeglądarki. Adres e-mail podaj
              tylko, jeśli chcesz otrzymać odpowiedź; używamy go wyłącznie w tym celu.
            </p>
            <div aria-live="polite" className="empty:hidden">
              {state.kind === 'error' && <p className="rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-[var(--danger)]">{state.message}</p>}
            </div>
            <button
              type="submit"
              disabled={state.kind === 'sending' || length < MIN}
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-2.5 font-semibold text-[var(--on-accent)] disabled:opacity-50"
            >
              {state.kind === 'sending' && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Wyślij zgłoszenie
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
