import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_EXTENT } from '@/map/projection';
import { config } from '@/config/runtime';
import { overlayOpacity, useMapStore } from './store';

const state = () => useMapStore.getState();

beforeEach(() => {
  useMapStore.setState({ base: 'orto', overlays: ['kieg'], sublayers: {}, opacity: {}, panel: 'none', focus: null });
});

describe('defaults', () => {
  const fresh = async (phone: boolean) => {
    vi.resetModules();
    // Fresh modules start without configuration, as on a page load: main.tsx gives it first.
    (await import('@/config/runtime')).initConfig(config);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: phone && query.includes('max-width'), media: query }));
    return (await import('./store')).useMapStore.getState();
  };

  it('keeps geoportal catalog layers from a link, and drops ids that cannot be layer ids', async () => {
    window.history.replaceState(null, '', '?l=kieg,msINSPIRERejZabNieruch,a b,../x');
    const s = await fresh(false);
    expect(s.overlays).toEqual(['kieg', 'msINSPIRERejZabNieruch']);
    window.history.replaceState(null, '', '/');
  });

  it('drops catalog layer ids from a link when the deployment has no catalog', async () => {
    const { initConfig } = await import('@/config/runtime');
    window.history.replaceState(null, '', '?l=kieg,msINSPIRERejZabNieruch');
    vi.resetModules();
    (await import('@/config/runtime')).initConfig({ ...config, modules: {} });
    expect((await import('./store')).useMapStore.getState().overlays).toEqual(['kieg']);
    initConfig(config);
    window.history.replaceState(null, '', '/');
  });

  it('starts on the general map on a computer and on the simple map on a phone', async () => {
    expect((await fresh(false)).base).toBe('mapa');
    expect((await fresh(true)).base).toBe('prosta');
  });

  it('starts with the land register on, no custom sublayers and no tool', async () => {
    const s = await fresh(false);
    expect(s.overlays).toEqual(['kieg']);
    expect(s.sublayers).toEqual({});
    expect(s.tool).toBe('none');
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
    expect(state().focus).toMatchObject({ extent: HOME_EXTENT });
    state().zoomToScale(9000);
    expect(state().focus).toMatchObject({ scale: 9000 });
  });
});

describe('measurement tool', () => {
  it('switches tools, keeps the last result and clears it with the drawings', () => {
    state().setTool('measure-area');
    expect(state().tool).toBe('measure-area');
    state().setMeasureResult('1 ha');
    const clears = state().measureClears;
    state().clearMeasurements();
    expect(state().measureClears).toBe(clears + 1);
    expect(state().measureResult).toBe('');
    state().setTool('none');
    expect(state().tool).toBe('none');
  });
});

describe('overlayOpacity', () => {
  it('prefers the user value, then the configured default, then 1', () => {
    expect(overlayOpacity('kimpzp', {})).toBe(0.8);
    expect(overlayOpacity('kimpzp', { kimpzp: 0.3 })).toBe(0.3);
    expect(overlayOpacity('kieg', {})).toBe(1);
  });
});
