import Control from 'ol/control/Control';
import type MapEvent from 'ol/MapEvent';
import { OGC_PIXEL } from './projection';
import { scaleText } from './format';

/**
 * Scale denominator rounded to two significant digits: 1:47 000 rather than 1:47 247. On a screen
 * the true scale depends on the monitor, so more digits would only pretend to be exact.
 */
export function roundScale(scale: number): number {
  if (!(scale > 0)) return 0;
  const step = 10 ** Math.max(0, Math.floor(Math.log10(scale)) - 1);
  return Math.round(scale / step) * step;
}

/**
 * The middle of the bottom bar: the map scale as a number (1:47 000), always shown, and beside it
 * the cursor position (MousePosition renders into `positionTarget`; it is shown only with a mouse).
 * The scale follows the WMS convention of 0.28 mm pixels, like the print, and is updated with
 * every frame as the map zooms.
 */
export class MapStatus extends Control {
  private readonly scale = document.createElement('span');

  constructor() {
    const element = document.createElement('div');
    element.className = 'map-status ol-unselectable';
    super({ element });
    const group = document.createElement('span');
    group.className = 'mp-system mp-scale';
    group.title = 'Skala przybliżona: na ekranie zależy od wielkości piksela monitora';
    const label = document.createElement('b');
    label.textContent = 'Skala';
    group.append(label, this.scale);
    element.append(group);
  }

  /** Element the cursor position is rendered into, after the scale. */
  get positionTarget(): HTMLElement {
    return this.element!;
  }

  override render(event: MapEvent): void {
    const resolution = event.frameState?.viewState.resolution;
    const text = resolution ? scaleText(roundScale(resolution / OGC_PIXEL)) : '';
    if (this.scale.textContent !== text) this.scale.textContent = text;
  }
}
