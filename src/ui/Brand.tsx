import logoUrl from '@/assets/envirosolutions.svg';

import { config } from '@/config/runtime';
import { t } from '@/i18n';

export const APP_NAME = config.app.name;
export const APP_DOMAIN = config.app.domain;
export const AUTHOR_URL = config.app.author.url;

/**
 * Sign of the app: a magnifying glass over parcel boundaries, one parcel picked out in the
 * orange the map uses for found objects; EnviroSolutions greens. The lines inside the lens are
 * chords of its circle, so no clip path (and no id that could clash) is needed.
 */
export function BrandMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 104 104" className={className} aria-hidden="true">
      <rect width="104" height="104" rx="22" fill="#466946" />
      <circle cx="46" cy="46" r="19" fill="#f2f4f5" />
      <path
        d="M28.6 41.3 62.9 39.8M41.3 28.6 42.9 63.7M29.1 52.2 63.4 50.7M50.7 28.6V63.4"
        fill="none"
        stroke="#59705b"
        strokeWidth="2.5"
      />
      <path d="M42.6 40.9 50.7 40.5V50.9L42.8 51.3Z" fill="#FF8142" />
      <circle cx="46" cy="46" r="21" fill="none" stroke="#fff" strokeWidth="6" />
      <path d="M62 62 79 79" stroke="#fff" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The part of the name in the accent colour, as in the logo: the last word (Mapa Gminy), or in a
 * one-word name its last capitalised part (Mini·Geoportal).
 */
const LAST = APP_NAME.includes(' ') ? APP_NAME.slice(APP_NAME.lastIndexOf(' ') + 1) : (/\p{Lu}\P{Lu}*$/u.exec(APP_NAME)?.[0] ?? APP_NAME);
const LEAD = APP_NAME.slice(0, APP_NAME.length - LAST.length);

export function Wordmark() {
  return (
    <span className="text-[15px] leading-none tracking-tight whitespace-nowrap">
      {LEAD && <span className="font-medium">{LEAD}</span>}
      <span className="font-bold text-[var(--accent)]">{LAST}</span>
    </span>
  );
}

/** Logo of the author, on a light background as the brand book requires. */
export function AuthorLogo({ className = 'h-7' }: { className?: string }) {
  return <img src={logoUrl} alt={config.app.author.name} className={className} />;
}

export function AuthorCredit() {
  return (
    <a
      href={AUTHOR_URL}
      target="_blank"
      rel="noopener"
      className="author-credit pointer-events-auto absolute right-3 bottom-7 z-20 flex items-center gap-1 rounded-xl bg-white/95 py-0.5 pr-1 pl-2.5 text-[10px] text-[#444444] shadow-md ring-1 ring-black/5 sm:right-4 sm:bottom-8"
      title={config.app.author.name}
    >
      {t('brand.madeBy')}
      {/* The logo keeps its colours on a white plate, also in high contrast. */}
      <span className="author-logo -my-1 rounded-lg bg-white">
        <AuthorLogo className="h-8" />
      </span>
    </a>
  );
}
