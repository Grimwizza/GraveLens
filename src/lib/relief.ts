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

  // 3. Local contrast boost (CLAHE-lite)
  // Stretch contrast tile-by-tile so faint engravings at any part of the
  // stone surface get amplified, not just the globally darkest region.
  localContrastBoost(composite, width, height);

  // 4. Unsharp mask
  // Amplifies engraving edges without blowing out flat stone faces.
  unsharpMask(composite, width, height);

  return new ImageData(composite, width, height);
}

/**
 * CLAHE-lite: divides the image into tiles and stretches contrast within
 * each tile independently. Reveals shallow engravings that a global stretch
 * would suppress.
 *
 * @param data   RGBA Uint8ClampedArray (mutated in place)
 * @param width  Image width in pixels
 * @param height Image height in pixels
 * @param tiles  Number of tiles per axis (default 8 → 8×8 grid)
 */
export function localContrastBoost(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tiles = 8,
): void {
  const tileW = Math.ceil(width / tiles);
  const tileH = Math.ceil(height / tiles);

  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const x0 = tx * tileW;
      const y0 = ty * tileH;
      const x1 = Math.min(x0 + tileW, width);
      const y1 = Math.min(y0 + tileH, height);

      // Find local min/max luma
      let tMin = 255;
      let tMax = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (luma < tMin) tMin = luma;
          if (luma > tMax) tMax = luma;
        }
      }

      // Skip tiles with very little range to avoid amplifying flat noise
      const tRange = tMax - tMin;
      if (tRange < 12) continue;

      // Stretch each channel within the tile
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          data[i]     = Math.min(255, Math.max(0, ((data[i]     - tMin) / tRange) * 255));
          data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] - tMin) / tRange) * 255));
          data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] - tMin) / tRange) * 255));
        }
      }
    }
  }
}

/**
 * Unsharp mask: blurs a copy then blends `2×original − blurred`.
 * Sharpens engraving edges without introducing halos on smooth stone.
 *
 * @param data    RGBA Uint8ClampedArray (mutated in place)
 * @param width   Image width in pixels
 * @param height  Image height in pixels
 * @param amount  Sharpening strength 0–1 (default 0.6)
 */
export function unsharpMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 0.6,
): void {
  const blurred = new Uint8ClampedArray(data.length);

  // 3×3 box blur (separable, single-pass for simplicity)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = (ny * width + nx) * 4;
          sumR += data[ni];
          sumG += data[ni + 1];
          sumB += data[ni + 2];
          count++;
        }
      }
      const bi = (y * width + x) * 4;
      blurred[bi]     = sumR / count;
      blurred[bi + 1] = sumG / count;
      blurred[bi + 2] = sumB / count;
      blurred[bi + 3] = 255;
    }
  }

  // Blend: sharpened = original + amount × (original − blurred)
  for (let i = 0; i < data.length - 3; i += 4) {
    data[i]     = Math.min(255, Math.max(0, data[i]     + amount * (data[i]     - blurred[i])));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + amount * (data[i + 1] - blurred[i + 1])));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + amount * (data[i + 2] - blurred[i + 2])));
  }
}
