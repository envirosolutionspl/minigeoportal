import { describe, expect, it, vi } from 'vitest';
import { infoFormat, layerMeta, loadCapabilities, serviceError, visibleAtScale, wmtsMeta } from './meta';
import { CAPABILITIES, stubFetch, withCapabilities } from '@/test/helpers';

describe('loadCapabilities', () => {
  it('leaves the app on defaults when the API is down and tries once more in the background', async () => {
    vi.useFakeTimers();
    const { fetchMock } = stubFetch([]);
    await loadCapabilities();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(layerMeta('kieg', 'dzialki')).toBeUndefined();
    expect(visibleAtScale('kieg', 'dzialki', 1e9)).toBe(true);
    await vi.advanceTimersByTimeAsync(2100);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('exposes layer, tile and error metadata once loaded', async () => {
    await withCapabilities();
    expect(layerMeta('kieg', 'dzialki')).toEqual(
      CAPABILITIES.services.kieg.kind === 'wms' ? CAPABILITIES.services.kieg.layers.dzialki : null,
    );
    expect(wmtsMeta('orto')?.matrixSet.matrices).toHaveLength(3);
    expect(wmtsMeta('kieg')).toBeUndefined();
    expect(serviceError('kiut')).toBe('HTTP 403');
    expect(serviceError('kieg')).toBeUndefined();
  });
});

describe('visibleAtScale', () => {
  it('applies both limits', async () => {
    await withCapabilities();
    expect(visibleAtScale('kieg', 'obreby', 15000)).toBe(true);
    expect(visibleAtScale('kieg', 'obreby', 5000)).toBe(false);
    expect(visibleAtScale('kieg', 'obreby', 50000)).toBe(false);
    expect(visibleAtScale('kieg', 'dzialki', 500)).toBe(true);
  });
});

describe('infoFormat', () => {
  it('prefers text/xml, then text/html, and falls back to text/html without metadata', async () => {
    await withCapabilities();
    expect(infoFormat('kieg')).toBe('text/xml');
    expect(infoFormat('kimpzp')).toBe('text/html');
    expect(infoFormat('pog')).toBe('text/html');
  });
});
