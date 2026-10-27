import { useRef, useState } from 'react';
import { create } from 'zustand';
import { Accessibility } from 'lucide-react';
import { useAccessibility } from './AccessibilityDialog';
import { config } from '@/config/runtime';
import { t } from '@/i18n';
import { IconButton } from './TopBar';
import { useDismiss } from './useDismiss';

/**
 * Display aids common on Polish public websites: larger text in two steps and a high-contrast
 * theme (yellow on black). WCAG 2.1 AA is met without them; they help people with low vision
 * who do not use the browser's own zoom or a system contrast theme. The choice is remembered.
 */

type TextSize = 0 | 1 | 2;
const ROOT_SIZE = ['100%', '112.5%', '125%'];

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
  { size: 0, label: 'A', name: t('display.textNormal') },
  { size: 1, label: 'A+', name: t('display.textLarger') },
  { size: 2, label: 'A++', name: t('display.textLargest') },
];

/** The language's own name for itself: polski, English. */
const languageName = (code: string) => {
  const name = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
};

/**
 * Another language: its own address (/en/, the same view), and a cookie, so that the bare address
 * of the app opens in it next time too.
 */
function switchLanguage(code: string) {
  document.cookie = `lang=${encodeURIComponent(code)}; path=/; max-age=31536000; samesite=lax`;
  const url = new URL(location.href);
  url.pathname = config.localePaths[code];
  url.searchParams.delete('lang');
  location.assign(url);
}

/** Button with text size and contrast switches, among the map tools. */
export function DisplayMenu({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(open, root, () => setOpen(false));

  return (
    <div ref={root} className={`relative ${className}`}>
      <IconButton label={t('display.button')} expanded={open} controls="display-menu" onClick={() => setOpen(!open)}>
        <Accessibility className="h-5 w-5" />
      </IconButton>
      {open && (
        <div
          id="display-menu"
          role="group"
          aria-label={t('display.menu')}
          className="display-menu absolute top-0 right-full z-40 mr-2 w-64 rounded-2xl bg-[var(--surface)] p-3 text-sm shadow-lg ring-1 ring-black/5"
        >
          <DisplayOptions onLeave={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** Text size, contrast, language and the accessibility statement; `onLeave` runs before the statement opens. */
export function DisplayOptions({ onLeave }: { onLeave: () => void }) {
  const { textSize, contrast, set } = useDisplay();
  /** A choice; the one pressed is lit (aria-pressed). */
  const option =
    'flex min-h-10 min-w-10 items-center justify-center rounded-xl px-2 font-semibold ring-1 ring-[var(--hover)] hover:bg-[var(--hover)] aria-pressed:bg-[var(--accent)] aria-pressed:text-[var(--on-accent)]';

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 font-medium">{t('display.textSize')}</p>
        <div className="flex gap-2">
          {SIZES.map(({ size, label, name }) => (
            <button
              key={size}
              type="button"
              aria-pressed={textSize === size}
              aria-label={name}
              title={name}
              onClick={() => set({ textSize: size })}
              className={option}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" aria-pressed={contrast} onClick={() => set({ contrast: !contrast })} className={`${option} w-full gap-2`}>
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-xs text-[#ffff00] ring-1 ring-[#ffff00]"
        >
          A
        </span>
        {t('display.contrast')}
      </button>
      {config.locales.length > 1 && (
        <div>
          <p className="mb-1.5 font-medium">{t('display.language')}</p>
          <div className="flex flex-wrap gap-2">
            {config.locales.map((code) => (
              <button
                key={code}
                type="button"
                lang={code}
                aria-pressed={config.locale === code}
                onClick={() => config.locale !== code && switchLanguage(code)}
                className={option}
              >
                {languageName(code)}
              </button>
            ))}
          </div>
        </div>
      )}
      {config.content.accessibility && (
        <button
          type="button"
          onClick={() => {
            onLeave();
            useAccessibility.getState().setOpen(true);
          }}
          className="min-h-6 text-[var(--accent)] underline underline-offset-2"
        >
          {t('accessibility.title')}
        </button>
      )}
    </div>
  );
}
