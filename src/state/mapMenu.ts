import { create } from 'zustand';

/** Where the map's context menu was opened: on the screen (map pixel) and on the map. */
export interface MapMenuAt {
  pixel: [number, number];
  coordinate: [number, number];
  /** Opened with the menu key: closing it gives the focus back to the map. */
  byKeyboard: boolean;
}

interface MapMenuStore {
  at: MapMenuAt | null;
  /** A long press opened it: the click its release makes is not a click on the map. */
  pressOpened: boolean;
  open(at: MapMenuAt, byPress?: boolean): void;
  close(): void;
}

export const useMapMenu = create<MapMenuStore>((set) => ({
  at: null,
  pressOpened: false,
  open: (at, byPress = false) => set({ at, pressOpened: byPress }),
  close: () => set({ at: null, pressOpened: false }),
}));

let swallowed = false;

/** Something over the map used the click that is about to reach the map (the curtain's track). */
export function swallowMapClick(): void {
  swallowed = true;
}

/**
 * A click on the map while the menu is open only closes it, as with any context menu; the click
 * that ends the long press which opened it does nothing, and so does one that something over
 * the map used. True when the click is used up so.
 */
export function consumeMapClick(): boolean {
  if (swallowed) {
    swallowed = false;
    return true;
  }
  const { at, pressOpened, close } = useMapMenu.getState();
  if (pressOpened) {
    useMapMenu.setState({ pressOpened: false });
    return true;
  }
  if (!at) return false;
  close();
  return true;
}

/** A new press on the map: the release of the press that opened the menu can no longer come. */
export function mapPressed(): void {
  swallowed = false;
  if (useMapMenu.getState().pressOpened) useMapMenu.setState({ pressOpened: false });
}
