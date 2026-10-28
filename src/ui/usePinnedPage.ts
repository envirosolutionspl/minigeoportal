import { useEffect, type RefObject } from 'react';

/** A field that raises the phone's keyboard: while it has the focus, the browser places the page. */
const TYPING = 'input, textarea, select, [contenteditable="true"]';

/**
 * The app fills the screen and never scrolls, yet browsers scroll it: focus brings a field or a
 * heading into view even in a box with hidden overflow (a panel still sliding in), and iOS Safari
 * lifts the page above the keyboard and at times leaves it lifted once the field is gone (a parcel
 * found by the form), cutting off the controls at the bottom. Whatever moved is put back as soon as
 * no field is being typed in.
 */
export function usePinnedPage(box: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const pin = () => {
      if (document.activeElement?.matches(TYPING)) return;
      if (el.scrollTop || el.scrollLeft) {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      }
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    };
    // After the focus leaves a field, once the keyboard has gone.
    const later = () => window.setTimeout(pin, 300);
    el.addEventListener('scroll', pin);
    window.addEventListener('scroll', pin);
    document.addEventListener('focusout', later);
    window.visualViewport?.addEventListener('resize', pin);
    return () => {
      el.removeEventListener('scroll', pin);
      window.removeEventListener('scroll', pin);
      document.removeEventListener('focusout', later);
      window.visualViewport?.removeEventListener('resize', pin);
    };
  }, [box]);
}
