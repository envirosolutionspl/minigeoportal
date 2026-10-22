import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Accessibility } from 'lucide-react';
import { useAccessibility } from './AccessibilityDialog';

/**
 * Display aids common on Polish public websites: larger text in two steps and a high-contrast
 * theme (yellow on black). WCAG 2.1 AA is met without them; they help people with low vision
 * who do not use the browser's own zoom or a system contrast theme. The choice is remembered.
 */

type TextSize = 0 | 1 | 2;
const ROOT_SIZE = ['100%', '112.5%', '125%'];
import { config } from '@/config/runtime';

const STORAGE_KEY = `${config.app.storagePrefix}display.v1`;

interface Display {
  textSize: TextSize;
  contrast: boolean;
}

function load(): Display {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Display>;
    return {
      textSize: ([0, 1, 2] as const).includes(saved.textSize as TextSize) ? (saved.textSize as TextSize) : 0,
      contrast: saved.contrast === true,
    };
  } catch {
    return { textSize: 0, contrast: false };
  }
}

/** Applies the settings to the page: root font size (Tailwind sizes are in rem) and the theme. */
function applyDisplay({ textSize, contrast }: Display): void {
  const root = document.documentElement;
  root.style.fontSize = ROOT_SIZE[textSize];
  if (contrast) root.dataset.contrast = 'high';
  else delete root.dataset.contrast;
}

export const useDisplay = create<Display & { set(d: Partial<Display>): void }>((set, get) => ({
  ...load(),
  set: (d) => {
    set(d);
    const { textSize, contrast } = get();
    applyDisplay({ textSize, contrast });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ textSize, contrast }));
    } catch {
      // Storage blocked: the choice lasts until the page is closed.
    }
  },
}));

applyDisplay(useDisplay.getState());

const SIZES: { size: TextSize; label: string; name: string }[] = [
  { size: 0, label: 'A', name: 'Tekst standardowy' },
  { size: 1, label: 'A+', name: 'Tekst większy' },
  { size: 2, label: 'A++', name: 'Tekst największy' },
];

/** Button with text size and contrast switches, among the map tools. */
export function DisplayMenu() {
  const [open, setOpen] = useState(false);
  const { textSize, contrast, set } = useDisplay();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', close, true);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close, true);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);

  const option = (pressed: boolean) =>
    `flex min-h-10 min-w-10 items-center justify-center rounded-xl px-2 font-semibold ring-1 ring-[var(--hover)] ${
      pressed ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'hover:bg-[var(--hover)]'
    }`;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Ułatwienia: wielkość tekstu i kontrast"
        title="Ułatwienia: wielkość tekstu i kontrast"
        aria-expanded={open}
        aria-controls="display-menu"
        className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg ring-1 ring-black/5 transition ${
          open ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[var(--surface)] hover:bg-[var(--hover)]'
        }`}
      >
        <Accessibility className="h-5 w-5" />
      </button>
      {open && (
        <div
          id="display-menu"
          role="group"
          aria-label="Ułatwienia"
          className="display-menu absolute top-0 right-full z-40 mr-2 w-64 space-y-3 rounded-2xl bg-[var(--surface)] p-3 text-sm shadow-lg ring-1 ring-black/5"
        >
          <div>
            <p className="mb-1.5 font-medium">Wielkość tekstu</p>
            <div className="flex gap-2">
              {SIZES.map(({ size, label, name }) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={textSize === size}
                  aria-label={name}
                  title={name}
                  onClick={() => set({ textSize: size })}
                  className={option(textSize === size)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            aria-pressed={contrast}
            onClick={() => set({ contrast: !contrast })}
            className={`${option(contrast)} w-full gap-2`}
          >
            <span
              aria-hidden="true"
              className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-xs text-[#ffff00] ring-1 ring-[#ffff00]"
            >
              A
            </span>
            Wysoki kontrast
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              useAccessibility.getState().setOpen(true);
            }}
            className="min-h-6 text-[var(--accent)] underline underline-offset-2"
          >
            Deklaracja dostępności
          </button>
        </div>
      )}
    </div>
  );
}
