import { describe, expect, it, vi } from 'vitest';
import OlMap from 'ol/Map';
import View from 'ol/View';
import MousePosition from 'ol/control/MousePosition';
import { PROJECTION, OGC_PIXEL } from './projection';
import { MapStatus, roundScale } from './mapStatus';

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

describe('MapStatus', () => {
  // The scale on the ground in a Mercator map: src/config/osm.test.ts.
  it('shows the numeric scale in the bottom bar, with the cursor position beside it, and follows the zoom', () => {
    // OpenLayers watches the map size; jsdom has no ResizeObserver.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const view = new View({ projection: PROJECTION, center: [500000, 500000], resolution: 47247.1183 * OGC_PIXEL });
    const status = new MapStatus();
    const map = new OlMap({
      target: document.createElement('div'),
      view,
      controls: [status, new MousePosition({ target: status.positionTarget })],
    });
    map.setSize([800, 600]);
    map.renderSync();
    const bar = map.getViewport()!.querySelector('.map-status')!;
    expect(plain(bar.querySelector('.mp-scale')?.textContent)).toBe('Skala1:47 000');
    // The cursor position sits in the same bar, after the scale.
    expect(bar.lastElementChild?.classList.contains('ol-mouse-position')).toBe(true);

    view.setResolution(1889.8847 * OGC_PIXEL);
    map.renderSync();
    // Polish groups digits only from five up: 1:1900, 1:47 000.
    expect(plain(bar.querySelector('.mp-scale')?.textContent)).toBe('Skala1:1900');
    map.setTarget(undefined);
  });
});
