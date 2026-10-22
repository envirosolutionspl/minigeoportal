import { useEffect, useId, useRef, useState } from 'react';
import { create } from 'zustand';
import { APP_NAME, AUTHOR_URL, AuthorLogo, BrandMark } from './Brand';
import { useReport } from './ReportDialog';
import { useAccessibility } from './AccessibilityDialog';

import { STORAGE_PREFIX } from '@/services/brand';

const STORAGE_KEY = `${STORAGE_PREFIX}welcome.v1`;

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
  const titleId = useId();

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
      aria-labelledby={titleId}
      className="m-auto w-[min(42rem,calc(100%-2rem))] rounded-3xl outline-none bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-[#253326]/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6">
        <header className="flex items-center gap-3">
          <BrandMark className="h-10 w-10 shrink-0" />
          <div>
            <h1 id={titleId} className="text-lg font-bold tracking-tight">
              {APP_NAME}
            </h1>
            <p className="text-sm text-[var(--muted)]">Dane z geoportal.gov.pl – prościej i szybciej</p>
          </div>
        </header>

        <div className="mt-4 space-y-3 text-sm leading-normal">
          <section>
            <h2 className="mb-1 font-semibold">Po co jest ten serwis</h2>
            <p>
              {APP_NAME} pokazuje te same publiczne dane co krajowy geoportal.gov.pl, ale w formie przyjaznej dla
              osób, które nie zajmują się mapami zawodowo. Wyszukaj i przejrzyj oficjalne dane szybciej i łatwiej.
            </p>
            <p className="mt-2">
              Zobaczysz granice i numer działki, przeznaczenie w planie miejscowym lub ogólnym, ceny transakcyjne w
              okolicy, uzbrojenie terenu i zdjęcia lotnicze. Bez logowania i bez opłat, na komputerze i na telefonie.
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

          <section className="rounded-2xl bg-[var(--field)] px-4 py-3">
            <h2 className="mb-1 font-semibold">Ważne</h2>
            <p>
              Informacje mają charakter poglądowy i nie są dokumentem urzędowym. Wiążące dane wydaje starostwo
              (ewidencja gruntów i budynków) lub gmina (plany zagospodarowania). {APP_NAME} to niezależny serwis
              open source, a nie serwis GUGiK.
            </p>
          </section>
        </div>

        <footer className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        {/* Links and the author in one row, so the window fits a laptop screen without scrolling. */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-[var(--hover)] pt-2 text-sm sm:justify-between">
          <button type="button" onClick={report} className="min-h-6 text-[var(--accent)] underline underline-offset-2">
            Zgłoś błąd w serwisie
          </button>
          <button type="button" onClick={accessibility} className="min-h-6 text-[var(--accent)] underline underline-offset-2">
            Deklaracja dostępności
          </button>
          <a href={AUTHOR_URL} target="_blank" rel="noopener" className="flex items-center gap-2 text-xs text-[var(--muted)]">
            Stworzone przez
            <span className="rounded-lg bg-white px-1">
              <AuthorLogo className="h-7" />
            </span>
          </a>
        </div>
      </div>
    </dialog>
  );
}
