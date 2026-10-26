import { beforeEach, describe, expect, it } from 'vitest';
import { consumeMapClick, mapPressed, useMapMenu } from './mapMenu';

const AT = { pixel: [10, 20] as [number, number], coordinate: [600000, 500000] as [number, number], byKeyboard: false };

beforeEach(() => useMapMenu.getState().close());

describe('clicks on the map and the context menu', () => {
  it('leaves clicks to the map while the menu is closed', () => {
    expect(consumeMapClick()).toBe(false);
  });

  it('closes the menu with a click on the map, which then asks about nothing', () => {
    useMapMenu.getState().open(AT);
    expect(consumeMapClick()).toBe(true);
    expect(useMapMenu.getState().at).toBeNull();
    expect(consumeMapClick()).toBe(false);
  });

  it('keeps the menu a long press opened when the finger lets go', () => {
    useMapMenu.getState().open(AT, true);
    expect(consumeMapClick()).toBe(true);
    expect(useMapMenu.getState().at).toEqual(AT);
    // The next tap closes it.
    expect(consumeMapClick()).toBe(true);
    expect(useMapMenu.getState().at).toBeNull();
  });

  it('forgets the release after a new press, when the finger moved and made no click', () => {
    useMapMenu.getState().open(AT, true);
    mapPressed();
    expect(consumeMapClick()).toBe(true);
    expect(useMapMenu.getState().at).toBeNull();
  });
});
