import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config as defaults, initConfig } from '@/config/runtime';

/** Counts the loads of the place panel's parts; the module registry starts anew, so none happened yet. */
const { loaded } = vi.hoisted(() => ({ loaded: vi.fn() }));
vi.mock('./InfoParts', () => {
  loaded();
  return { Elevation: () => null, ParcelReportLink: () => null, OrthoPhoto: () => null };
});

beforeAll(async () => {
  vi.resetModules();
  (await import('@/config/runtime')).initConfig(defaults);
});
afterAll(() => {
  vi.useRealTimers();
  vi.resetModules();
  initConfig(defaults);
});

describe('gugik module', () => {
  it("loads the place panel's parts once the browser is idle after the start, not with the app", async () => {
    vi.useFakeTimers();
    // jsdom has no requestIdleCallback; a browser without one (Safari) loads the parts at the first click only.
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => setTimeout(cb, 0));
    const gugik = await import('./index');
    expect(gugik.infoHeader.length + gugik.infoFooter.length).toBeGreaterThan(0);
    expect(loaded).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await vi.dynamicImportSettled();
    expect(loaded).toHaveBeenCalledTimes(1);
  });
});
