/** Side of the thumbnail an image is checked on: detail of a map or a photo still shows in it. */
const SIDE = 64;
/** JPEG may round pure white down by a step. */
const WHITE = 254;

/** Whether RGBA pixels are all white or all transparent: an image with nothing drawn on it. */
export function blankPixels(data: ArrayLike<number>): boolean {
  let white = true;
  let clear = true;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 0) clear = false;
    if (data[i] < WHITE || data[i + 1] < WHITE || data[i + 2] < WHITE || data[i + 3] !== 255) white = false;
    if (!white && !clear) return false;
  }
  return true;
}

/**
 * Whether an image a service sent is blank: white or transparent all over, as GUGiK's services
 * answer when they fail, or where they have no data. Read through a thumbnail; an image the page
 * may not read (no CORS) or a browser without a canvas counts as drawn.
 */
export function isBlank(image: CanvasImageSource): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIDE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  try {
    context.drawImage(image, 0, 0, SIDE, SIDE);
    return blankPixels(context.getImageData(0, 0, SIDE, SIDE).data);
  } catch {
    return false;
  }
}
