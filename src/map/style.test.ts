import { describe, expect, it, vi } from 'vitest';

describe('map colours', () => {
  it('come from the skin on the page, else from the defaults', async () => {
    vi.resetModules();
    expect((await import('./style')).MEASURE).toBe('#466946');
    document.documentElement.style.setProperty('--map-measure', '#123456');
    vi.resetModules();
    const { MEASURE, translucent } = await import('./style');
    expect(MEASURE).toBe('#123456');
    expect(translucent('#ff8142', 0.5)).toEqual([255, 129, 66, 0.5]);
    document.documentElement.style.removeProperty('--map-measure');
  });
});
