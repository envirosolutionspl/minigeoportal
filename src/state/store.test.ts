import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_EXTENT } from '@/map/projection';
import { config } from '@/config/runtime';
import { overlayOpacity, urlState, useMapStore } from './store';

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

  it('opens the time view of a link, on the base map it forces', async () => {
    window.history.replaceState(null, '', '?b=mapa&t=2007-01-01&c=1&tl=mapy-dawne');
    const s = await fresh(false);
    expect(s.tool).toBe('time');
    expect(s.time).toBe('2007-01-01');
    expect(s.compare).toBe(true);
    expect(s.timeLayer).toBe('mapy-dawne');
    window.history.replaceState(null, '', '?t=2007-01-01&tl=nothing');
    expect((await fresh(false)).timeLayer).toBeNull();
    expect(s.base).toBe('orto');
    expect(s.baseBeforeTime).toBe('mapa');
    window.history.replaceState(null, '', '/');
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

describe('time view', () => {
  it('forces its base map while open and gives the one before back', () => {
    useMapStore.setState({ base: 'mapa', tool: 'none', timeStatus: 'error' });
    state().setTool('time');
    expect(state().base).toBe('orto');
    // Choosing the open view again does not take the forced base map for the one before.
    state().setTool('time');
    expect(state().baseBeforeTime).toBe('mapa');
    state().setTool('none');
    expect(state().base).toBe('mapa');
    expect(state().baseBeforeTime).toBeUndefined();
    expect(state().timeStatus).toBe('idle');
  });

  it('puts the date, the layer and the comparison into links only while the view is open', () => {
    useMapStore.setState({ tool: 'none', time: '2007-01-01', compare: true, timeLayer: 'mapy-dawne' });
    expect(urlState(state()).time).toBeUndefined();
    state().setTool('time');
    expect(urlState(state())).toMatchObject({ time: '2007-01-01', compare: true, timeLayer: 'mapy-dawne' });
    state().setTimeLayer(null);
    expect(urlState(state()).timeLayer).toBeUndefined();
    state().setCompare(false);
    expect(urlState(state()).compare).toBeUndefined();
  });

  it('keeps the curtain on the map', () => {
    state().setCurtain(1.4);
    expect(state().curtain).toBe(1);
    state().setCurtain(-2);
    expect(state().curtain).toBe(0);
    state().setCurtain(0.3);
    expect(state().curtain).toBe(0.3);
  });
});

describe('overlayOpacity', () => {
  it('prefers the user value, then the configured default, then 1', () => {
    expect(overlayOpacity('kimpzp', {})).toBe(0.8);
    expect(overlayOpacity('kimpzp', { kimpzp: 0.3 })).toBe(0.3);
    expect(overlayOpacity('kieg', {})).toBe(1);
  });
});
