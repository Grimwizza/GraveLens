/**
 * Processes a sequence of video frames to create a high-contrast depth map.
 * This is meant to be used for the "Relief Lens" feature where lighting changes
 * across frames, casting shadows on the engravings.
 */

export function processReliefFrames(frames: ImageData[]): ImageData {
  if (frames.length === 0) {
    throw new Error("No frames provided for relief processing");
  }

  const width = frames[0].width;
  const height = frames[0].height;
  const numPixels = width * height;
  const numFrames = frames.length;

  // The composite image data
  const composite = new Uint8ClampedArray(numPixels * 4);

  // 1. Minimum luminance composite
  // We keep the pixel that was the darkest across all frames.
  for (let i = 0; i < numPixels * 4; i += 4) {
    let minR = 255;
    let minG = 255;
    let minB = 255;
    let minLuma = Infinity;

    for (let f = 0; f < numFrames; f++) {
      const data = frames[f].data;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const o = data[i + 3];

      // Ignore transparent pixels if any
      if (o === 0) continue;

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma < minLuma) {
        minLuma = luma;
        minR = r;
        minG = g;
        minB = b;
      }
    }

    composite[i] = minR;
    composite[i + 1] = minG;
    composite[i + 2] = minB;
    composite[i + 3] = 255; // Alpha
  }

  // 2. Contrast stretching
  // Find min and max luma of the composite to stretch it to 0-255.
  let cMin = 255;
  let cMax = 0;
  for (let i = 0; i < numPixels * 4; i += 4) {
    const r = composite[i];
    const g = composite[i + 1];
    const b = composite[i + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luma < cMin) cMin = luma;
    if (luma > cMax) cMax = luma;
  }

  const range = cMax - cMin || 1;

  for (let i = 0; i < numPixels * 4; i += 4) {
    composite[i] = Math.min(255, Math.max(0, ((composite[i] - cMin) / range) * 255));
    composite[i + 1] = Math.min(255, Math.max(0, ((composite[i + 1] - cMin) / range) * 255));
    composite[i + 2] = Math.min(255, Math.max(0, ((composite[i + 2] - cMin) / range) * 255));
  }

  return new ImageData(composite, width, height);
}
