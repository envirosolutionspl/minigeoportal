import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { t } from '@/i18n';

/** How long a message stays: short ones a moment, longer ones long enough to read. */
const SHORT_MS = 5000;
const LONG_MS = 8000;

/**
 * A short message at the bottom of the screen (a toast), as design systems advise: read out by
 * screen readers, gone by itself after a few seconds, kept while the pointer or the keyboard
 * focus is on it (WCAG 2.2.1 Timing Adjustable), and closable at once with its button.
 */
export function useNotice() {
  const [text, setText] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const hold = useRef(false);

  const stop = () => window.clearTimeout(timer.current);
  const start = useCallback((message: string) => {
    window.clearTimeout(timer.current);
    if (!hold.current) timer.current = window.setTimeout(() => setText(''), message.length > 80 ? LONG_MS : SHORT_MS);
  }, []);
  useEffect(() => stop, []);

  const say = useCallback(
    (message: string) => {
      setText(message);
      start(message);
    },
    [start],
  );

  const pause = () => {
    hold.current = true;
    stop();
  };
  const resume = () => {
    hold.current = false;
    start(text);
  };
  const close = () => {
    hold.current = false;
    stop();
    setText('');
  };

  const notice = (
    // The live region stays in the page, so a new message is read out; it is hidden when empty.
    <div
      role="status"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className={`pointer-events-auto fixed inset-x-0 bottom-20 z-50 mx-auto flex w-fit max-w-[min(28rem,calc(100%-2rem))] items-start gap-2 rounded-xl bg-[var(--text)] py-2 pr-1 pl-4 text-sm break-words text-[var(--surface)] shadow-lg ${
        text ? '' : 'sr-only'
      }`}
    >
      <span className="min-w-0 flex-1 py-1">{text}</span>
      {text && (
        <button
          type="button"
          onClick={close}
          aria-label={t('common.close')}
          title={t('common.close')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-white/15"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );

  return { say, notice };
}
