import { describe, expect, it, vi } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import { EPSG2180, OGC_PIXEL } from './projection';
import { ScaleLineWithRatio, roundScale } from './scaleRatio';

// Intl in pl-PL groups with a narrow no-break space; compare with plain spaces.
const plain = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');

describe('roundScale', () => {
  it('keeps two significant digits', () => {
    expect([47247.1183, 9449.4237, 1889.8847, 944.9424, 472471.183, 30238155.7].map(roundScale)).toEqual([
      47000, 9400, 1900, 940, 470000, 30000000,
    ]);
    expect(roundScale(0)).toBe(0);
  });
});

describe('ScaleLineWithRatio', () => {
  it('shows the numeric scale above the bar and follows the zoom', () => {
    // OpenLayers watches the map size; jsdom has no ResizeObserver.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const view = new View({ projection: EPSG2180, center: [500000, 500000], resolution: 47247.1183 * OGC_PIXEL });
    const map = new OlMap({ target: document.createElement('div'), view, controls: [new ScaleLineWithRatio({ units: 'metric' })] });
    map.setSize([800, 600]);
    map.renderSync();
    const box = map.getViewport()!.querySelector('.ol-scale-line')!;
    const ratio = box.querySelector('.scale-ratio')!;
    // Above the bar, in the same box.
    expect(box.firstElementChild).toBe(ratio);
    expect(plain(ratio.textContent)).toBe('1:47 000');

    view.setResolution(1889.8847 * OGC_PIXEL);
    map.renderSync();
    // Polish groups digits only from five up: 1:1900, 1:47 000.
    expect(plain(ratio.textContent)).toBe('1:1900');
    map.setTarget(undefined);
  });
});
