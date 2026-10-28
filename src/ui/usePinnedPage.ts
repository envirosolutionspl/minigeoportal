import { useEffect, type RefObject } from 'react';

/** A field that raises the phone's keyboard: while it has the focus, the browser places the box. */
const TYPING = 'input, textarea, select, [contenteditable="true"]';

/**
 * The app's box fills the screen and never scrolls, yet focus scrolls even a box with hidden
 * overflow to bring a field or a heading into view (a panel still sliding in). That is put back
 * as soon as no field is being typed in. The page itself is left alone: on a phone its scroll is
 * how a zoomed-in view is moved.
 */
export function usePinnedPage(box: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const pin = () => {
      if (document.activeElement?.matches(TYPING) || (!el.scrollTop && !el.scrollLeft)) return;
      el.scrollTop = 0;
      el.scrollLeft = 0;
    };
    // After the focus leaves a field.
    const later = () => window.setTimeout(pin, 300);
    el.addEventListener('scroll', pin);
    document.addEventListener('focusout', later);
    return () => {
      el.removeEventListener('scroll', pin);
      document.removeEventListener('focusout', later);
    };
  }, [box]);
}
