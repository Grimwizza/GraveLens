/**
 * Web Worker for off-thread relief frame processing.
 * Receives raw ArrayBuffers (transferred, not copied) to avoid main-thread stalls.
 *
 * Pipeline:
 *  1. Minimum luminance composite across all frames
 *  2. Global contrast stretch
 *  3. CLAHE-lite (per-tile contrast boost)
 *  4. Unsharp mask (edge sharpening)
 */

interface WorkerInput {
  buffers: ArrayBuffer[];
  width: number;
  height: number;
}

interface WorkerOutput {
  composite: ArrayBuffer;
  width: number;
  height: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function localContrastBoost(
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

      let tMin = 255, tMax = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (luma < tMin) tMin = luma;
          if (luma > tMax) tMax = luma;
        }
      }

      const tRange = tMax - tMin;
      if (tRange < 12) continue; // skip flat/noisy tiles

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

function unsharpMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 0.6,
): void {
  const blurred = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = (ny * width + nx) * 4;
          sumR += data[ni]; sumG += data[ni + 1]; sumB += data[ni + 2];
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

  for (let i = 0; i < data.length - 3; i += 4) {
    data[i]     = Math.min(255, Math.max(0, data[i]     + amount * (data[i]     - blurred[i])));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + amount * (data[i + 1] - blurred[i + 1])));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + amount * (data[i + 2] - blurred[i + 2])));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { buffers, width, height } = e.data;
  const numPixels = width * height;
  const numFrames = buffers.length;

  const frames = buffers.map((b) => new Uint8ClampedArray(b));
  const composite = new Uint8ClampedArray(numPixels * 4);

  // 1. Minimum luminance composite
  for (let i = 0; i < numPixels * 4; i += 4) {
    let minR = 255, minG = 255, minB = 255, minLuma = Infinity;

    for (let f = 0; f < numFrames; f++) {
      const data = frames[f];
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a === 0) continue;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma < minLuma) { minLuma = luma; minR = r; minG = g; minB = b; }
    }

    composite[i]     = minR;
    composite[i + 1] = minG;
    composite[i + 2] = minB;
    composite[i + 3] = 255;
  }

  // 2. Global contrast stretch
  let cMin = 255, cMax = 0;
  for (let i = 0; i < numPixels * 4; i += 4) {
    const luma = 0.299 * composite[i] + 0.587 * composite[i + 1] + 0.114 * composite[i + 2];
    if (luma < cMin) cMin = luma;
    if (luma > cMax) cMax = luma;
  }
  const range = cMax - cMin || 1;
  for (let i = 0; i < numPixels * 4; i += 4) {
    composite[i]     = Math.min(255, Math.max(0, ((composite[i]     - cMin) / range) * 255));
    composite[i + 1] = Math.min(255, Math.max(0, ((composite[i + 1] - cMin) / range) * 255));
    composite[i + 2] = Math.min(255, Math.max(0, ((composite[i + 2] - cMin) / range) * 255));
  }

  // 3. CLAHE-lite — per-tile local contrast boost
  localContrastBoost(composite, width, height);

  // 4. Unsharp mask — amplify engraving edges
  unsharpMask(composite, width, height);

  const result: WorkerOutput = { composite: composite.buffer, width, height };
  (self as unknown as Worker).postMessage(result, [composite.buffer]);
};
