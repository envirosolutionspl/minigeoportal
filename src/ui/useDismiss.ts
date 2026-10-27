import { useEffect, useEffectEvent, type RefObject } from 'react';

/**
 * Closes a menu or list open beside the map: on Escape and on a press outside `root`. Escape is
 * taken in the capture phase and stopped there, so nothing under the menu (the app's own Escape,
 * the map) acts on the same key; a press outside goes on to whatever it landed on. `onClose` gets
 * the event, for what differs by the way out (the focus after Escape, a press on the map).
 */
export function useDismiss(
  active: boolean,
  root: RefObject<HTMLElement | null>,
  onClose: (e: KeyboardEvent | PointerEvent) => void,
  { escape = true } = {},
): void {
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(e);
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(e);
    };
    if (escape) document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [active, root, escape]);
}
