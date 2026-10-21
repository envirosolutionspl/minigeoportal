import { beforeEach, describe, expect, it } from 'vitest';
import { POLAND_EXTENT } from '@/map/projection';
import { overlayOpacity, useMapStore } from './store';

const state = () => useMapStore.getState();

beforeEach(() => {
  useMapStore.setState({ base: 'orto', overlays: ['kieg'], sublayers: {}, opacity: {}, panel: 'none', focus: null });
});

describe('defaults', () => {
  it('starts on the orthophoto with the land register on and no custom sublayers', () => {
    expect(state().base).toBe('orto');
    expect(state().overlays).toEqual(['kieg']);
    expect(state().sublayers).toEqual({});
  });
});

describe('toggleOverlay', () => {
  it('adds and removes overlays, dropping their custom sublayers on removal', () => {
    useMapStore.setState({ sublayers: { kieg: ['dzialki'] } });
    state().toggleOverlay('kiut');
    expect(state().overlays).toEqual(['kieg', 'kiut']);
    state().toggleOverlay('kieg');
    expect(state().overlays).toEqual(['kiut']);
    expect(state().sublayers).toEqual({});
  });
});

describe('toggleSublayer', () => {
  it('turns an inactive overlay on with only that sublayer', () => {
    state().toggleSublayer('kiut', 'przewod_gazowy');
    expect(state().overlays).toContain('kiut');
    expect(state().sublayers.kiut).toEqual(['przewod_gazowy']);
  });

  it('removes and adds sublayers of an active overlay starting from its defaults', () => {
    state().toggleSublayer('kieg', 'numery_dzialek');
    expect(state().sublayers.kieg).toEqual(['obreby', 'dzialki', 'budynki']);
    state().toggleSublayer('kieg', 'uzytki');
    expect(state().sublayers.kieg).toEqual(['obreby', 'dzialki', 'budynki', 'uzytki']);
  });

  it('turns the overlay off when its last sublayer goes', () => {
    useMapStore.setState({ overlays: ['kiut'], sublayers: { kiut: ['przewod_gazowy'] } });
    state().toggleSublayer('kiut', 'przewod_gazowy');
    expect(state().overlays).toEqual([]);
    expect(state().sublayers).toEqual({});
  });

  it('ignores unknown overlays', () => {
    state().toggleSublayer('nope', 'x');
    expect(state().overlays).toEqual(['kieg']);
  });
});

describe('focus', () => {
  it('gives every request a new sequence number so repeats still trigger', () => {
    state().focusOn({ center: [1, 2], zoom: 10 });
    const first = state().focus!;
    state().focusOn({ center: [1, 2], zoom: 10 });
    expect(state().focus!.seq).toBe(first.seq + 1);
    state().clearFocus();
    expect(state().focus).toBeNull();
  });

  it('goHome shows the whole country and zoomToScale asks for a scale', () => {
    state().goHome();
    expect(state().focus).toMatchObject({ extent: POLAND_EXTENT });
    state().zoomToScale(9000);
    expect(state().focus).toMatchObject({ scale: 9000 });
  });
});

describe('overlayOpacity', () => {
  it('prefers the user value, then the registry default, then 1', () => {
    expect(overlayOpacity('kimpzp', {})).toBe(0.8);
    expect(overlayOpacity('kimpzp', { kimpzp: 0.3 })).toBe(0.3);
    expect(overlayOpacity('kieg', {})).toBe(1);
  });
});
