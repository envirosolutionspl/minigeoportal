import ScaleLine, { type Options } from 'ol/control/ScaleLine';
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
 * OpenLayers' scale bar with the numeric scale (1:47 000) above it, in the same box, updated with
 * every frame as the map zooms. It follows the WMS convention of 0.28 mm pixels, like the print.
 */
export class ScaleLineWithRatio extends ScaleLine {
  private readonly ratio = document.createElement('div');

  constructor(options?: Options) {
    super(options);
    this.ratio.className = 'scale-ratio';
    this.ratio.title = 'Skala przybliżona: na ekranie zależy od wielkości piksela monitora';
    this.element?.prepend(this.ratio);
  }

  override render(event: MapEvent): void {
    super.render(event);
    const resolution = event.frameState?.viewState.resolution;
    const text = resolution ? scaleText(roundScale(resolution / OGC_PIXEL)) : '';
    if (this.ratio.textContent !== text) this.ratio.textContent = text;
  }
}
