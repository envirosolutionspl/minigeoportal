import { useEffect, useId, useRef } from 'react';
import { create } from 'zustand';
import { X } from 'lucide-react';
import { CONTACT_EMAIL } from '@/services/brand';
import { APP_DOMAIN, APP_NAME } from './Brand';
import { useReport } from './ReportDialog';

export const useAccessibility = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

const PREPARED = '2026-10-21';

/**
 * Accessibility statement, following the structure required for public websites by the Polish
 * act on digital accessibility, against WCAG 2.1 AA (EN 301 549).
 */
export function AccessibilityDialog() {
  const open = useAccessibility((s) => s.open);
  const setOpen = useAccessibility((s) => s.setOpen);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const report = () => {
    setOpen(false);
    useReport.getState().openReport();
  };

  return (
    <dialog
      ref={dialog}
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === dialog.current && setOpen(false)}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[min(40rem,calc(100%-2rem))] rounded-3xl bg-[var(--surface)] p-0 text-[var(--text)] shadow-2xl outline-none backdrop:bg-[#253326]/50"
    >
      <div className="max-h-[85dvh] overflow-y-auto p-6 text-sm leading-relaxed sm:p-8">
        <header className="mb-4 flex items-start gap-3">
          <h2 id={`${id}-title`} className="flex-1 text-xl font-bold">
            Deklaracja dostępności
          </h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="Zamknij" className="rounded-full p-2 hover:bg-[var(--hover)]">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5">
          <p>
            EnviroSolutions zobowiązuje się zapewnić dostępność serwisu {APP_NAME} ({APP_DOMAIN}) zgodnie ze standardem
            WCAG 2.1 na poziomie AA (norma EN 301 549), wymaganym przez ustawę o dostępności cyfrowej stron
            internetowych i aplikacji mobilnych oraz ustawę o zapewnianiu spełniania wymagań dostępności niektórych
            produktów i usług.
          </p>

          <section>
            <h3 className="mb-1 font-semibold">Stan dostępności</h3>
            <p>Serwis jest częściowo zgodny z WCAG 2.1 AA z powodu niezgodności i wyłączeń wymienionych niżej.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Obraz mapy, ortofotomapy i warstw pochodzi z usług GUGiK, starostw i gmin i nie ma opisu tekstowego. Treść
                mapy w danym miejscu można odczytać jako tekst: Enter na mapie albo kliknięcie otwiera panel informacji
                o miejscu, a wyszukiwarki podają adresy i działki tekstem.
              </li>
              <li>Legendy warstw są obrazami dostarczanymi przez usługi źródłowe.</li>
              <li>Rysowanie pomiaru odległości i powierzchni wymaga myszy lub dotyku.</li>
              <li>Raport o działce otwiera się w serwisie geoportal.gov.pl, za którego dostępność odpowiada GUGiK.</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold">Obsługa z klawiatury</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Tab przechodzi między elementami, pierwszy z nich przenosi od razu do mapy lub wyszukiwarki.</li>
              <li>Na mapie: strzałki przesuwają, plus i minus zmieniają skalę, Enter pokazuje informacje o środku mapy.</li>
              <li>W wyszukiwarce: strzałki wybierają wynik, Enter pokazuje go na mapie, Esc zamyka listę.</li>
              <li>Esc zamyka okna, panel informacji i listę warstw.</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold">Ułatwienia</h3>
            <p>
              Przycisk ułatwień obok wyszukiwarki powiększa tekst (A, A+, A++) i włącza wysoki kontrast (żółty na
              czarnym); wybór jest zapamiętywany. Serwis działa przy powiększeniu przeglądarki do 200% i na wąskich
              ekranach, ma tryb ciemny zgodny z ustawieniem systemu i wyłącza animacje, gdy system prosi o ograniczenie
              ruchu. Komunikaty o wynikach wyszukiwania,
              wczytywaniu danych i pomiarach są odczytywane przez czytniki ekranu.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold">Przygotowanie deklaracji</h3>
            <p>
              Deklarację sporządzono {PREPARED} na podstawie samooceny przeprowadzonej przez EnviroSolutions, wspartej
              testami automatycznymi.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold">Informacje zwrotne i kontakt</h3>
            <p>
              Problemy z dostępnością prosimy zgłaszać przez{' '}
              <button type="button" onClick={report} className="text-[var(--accent)] underline underline-offset-2">
                formularz zgłoszeń
              </button>{' '}
              (rodzaj „Dostępność”) albo e-mailem na adres{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--accent)] underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>
              . Można też poprosić o informację z mapy w innej, dostępnej formie. Odpowiadamy niezwłocznie, nie później
              niż w ciągu 7 dni.
            </p>
          </section>
        </div>
      </div>
    </dialog>
  );
}
