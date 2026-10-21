import logoUrl from '@/assets/envirosolutions.svg';

export const APP_NAME = 'Prosty Geoportal';
export const APP_DOMAIN = 'prostygeoportal.pl';
export const AUTHOR_URL = 'https://envirosolutions.pl';

/** Sign of the app: a parcel outline with a point, in the EnviroSolutions palette. */
export function BrandMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#466946" />
      <path
        d="M7.5 22.5 10.5 8.5 22 7.5 25 20 15.5 25.5Z"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="16.2" cy="16" r="2.6" fill="#b3cbb4" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="text-[15px] leading-none tracking-tight whitespace-nowrap">
      <span className="font-medium">Prosty</span> <span className="font-bold text-[var(--accent)]">Geoportal</span>
    </span>
  );
}

/** Logo of the author, on a light background as the brand book requires. */
export function AuthorLogo({ className = 'h-7' }: { className?: string }) {
  return <img src={logoUrl} alt="EnviroSolutions" className={className} />;
}

export function AuthorCredit() {
  return (
    <a
      href={AUTHOR_URL}
      target="_blank"
      rel="noopener"
      className="author-credit pointer-events-auto absolute right-3 bottom-7 z-20 flex items-center gap-1 rounded-xl bg-white/95 py-0.5 pr-1 pl-2.5 text-[10px] text-[#444444] shadow-md ring-1 ring-black/5 sm:right-4 sm:bottom-8"
      title="EnviroSolutions: systemy i narzędzia OpenSource GIS"
    >
      Stworzone przez
      <AuthorLogo className="-my-1 h-8" />
    </a>
  );
}
