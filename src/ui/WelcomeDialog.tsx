import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { APP_DOMAIN, APP_NAME, AUTHOR_URL, AuthorLogo, BrandMark } from './Brand';
import { useReport } from './ReportDialog';
import { useAccessibility } from './AccessibilityDialog';

const STORAGE_KEY = 'prostygeoportal.welcome.v1';

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hidden';
  } catch {
    return false;
  }
}

function rememberDismissal(hide: boolean): void {
  try {
    if (hide) localStorage.setItem(STORAGE_KEY, 'hidden');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the dialog simply shows again next time.
  }
}

/** Open state is shared so the brand button in the search bar can reopen the dialog. */
export const useWelcome = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: !dismissedBefore(),
  setOpen: (open) => set({ open }),
}));

/** Information window shown on the first visit, as on public geoportals. */
export function WelcomeDialog() {
  const open = useWelcome((s) => s.open);
  const setOpen = useWelcome((s) => s.setOpen);
  const [hide, setHide] = useState(dismissedBefore);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    rememberDismissal(hide);
    setOpen(false);
  };

  const report = () => {
    close();
    useReport.getState().openReport();
  };

  const accessibility = () => {
    close();
    useAccessibility.getState().setOpen(true);
  };

  return (
    <dialog
      ref={dialog}
      onClose={close}
      onClick={(e) => e.target === dialog.current && close()}
      aria-labelledby="welcome-title"
      className="m-auto w-[min(36rem,calc(100%-2rem))] rounded-3xl outline-none bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-[#253326]/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="max-h-[85dvh] overflow-y-auto p-6 sm:p-8">
        <header className="flex items-center gap-3">
          <BrandMark className="h-11 w-11 shrink-0" />
          <div>
            <h1 id="welcome-title" className="text-xl font-bold tracking-tight">
              {APP_NAME}
            </h1>
            <p className="text-sm text-[var(--muted)]">Dane z geoportal.gov.pl – prościej i szybciej</p>
          </div>
        </header>

        <div className="mt-6 space-y-5 text-sm leading-relaxed">
          <section>
            <h2 className="mb-1 font-semibold">Po co jest ten serwis</h2>
            <p>
              {APP_NAME} pokazuje te same publiczne dane co krajowy geoportal.gov.pl, ale w formie przyjaznej dla
              osób, które nie zajmują się mapami zawodowo. Wpisz adres, miejscowość albo numer działki i kliknij mapę.
              Zobaczysz granice i numer działki, przeznaczenie w planie miejscowym lub ogólnym, ceny transakcyjne w
              okolicy, uzbrojenie terenu i zdjęcia lotnicze. Bez logowania i bez opłat, na komputerze i na telefonie.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">Skąd ten pomysł</h2>
            <p>
              Serwis powstał w odpowiedzi na głosy użytkowników geoportal.gov.pl, z którego co roku korzysta ponad 9 mln
              osób. W opiniach i na forach najczęściej powtarza się, że:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>trudno się w nim odnaleźć i nie wiadomo, co kliknąć,</li>
              <li>granice działek widać dopiero po dużym przybliżeniu, a numery są słabo czytelne,</li>
              <li>żeby znaleźć działkę, trzeba znać obręb albo jej identyfikator,</li>
              <li>plany miejscowe i ceny transakcyjne są rozrzucone po osobnych modułach,</li>
              <li>aplikacja mobilna często nie wczytuje map.</li>
            </ul>
            <p className="mt-2">
              Dlatego tutaj masz jedną mapę zamiast modułów i wyszukiwarkę, która rozumie zwykły adres. Najpotrzebniejsze
              warstwy są pod ręką, a ponad 400 pozostałych z geoportal.gov.pl czeka w katalogu z prostym podziałem na
              tematy. Mapa wczytuje się kilka razy szybciej niż oficjalna.
            </p>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">Skąd są dane</h2>
            <p>
              Wszystkie dane pochodzą z publicznych usług Głównego Urzędu Geodezji i Kartografii (
              <a href="https://www.geoportal.gov.pl" target="_blank" rel="noopener" className="text-[var(--accent)] underline">
                geoportal.gov.pl
              </a>
              ) oraz serwerów starostw, gmin i innych instytucji, z którymi te usługi się łączą. Mapa pobiera je na bieżąco i niczego nie
              zmienia ani nie przechowuje. Aktualność danych zależy od urzędu, który je prowadzi.
            </p>
          </section>

          <section className="rounded-2xl bg-[var(--field)] p-4">
            <h2 className="mb-1 font-semibold">Ważne</h2>
            <p>
              Informacje mają charakter poglądowy i nie są dokumentem urzędowym. Wiążące dane wydaje starostwo
              (ewidencja gruntów i budynków) lub gmina (plany zagospodarowania). {APP_NAME} to niezależny serwis
              open source, a nie serwis GUGiK.
            </p>
          </section>
        </div>

        <footer className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">
            <input
              type="checkbox"
              checked={hide}
              onChange={(e) => setHide(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            Nie pokazuj ponownie
          </label>
          <button
            type="button"
            onClick={close}
            autoFocus
            className="rounded-2xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--on-accent)] transition hover:brightness-110"
          >
            Przejdź do mapy
          </button>
        </footer>

        <p className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <button type="button" onClick={report} className="min-h-6 text-[var(--accent)] underline underline-offset-2">
            Zgłoś błąd w serwisie
          </button>
          <button type="button" onClick={accessibility} className="min-h-6 text-[var(--accent)] underline underline-offset-2">
            Deklaracja dostępności
          </button>
        </p>

        <a
          href={AUTHOR_URL}
          target="_blank"
          rel="noopener"
          className="mt-6 flex items-center justify-center gap-2 border-t border-[var(--hover)] pt-4 text-xs text-[var(--muted)]"
        >
          {APP_DOMAIN} · stworzone przez
          <span className="rounded-lg bg-white px-1">
            <AuthorLogo className="h-8" />
          </span>
        </a>
      </div>
    </dialog>
  );
}
