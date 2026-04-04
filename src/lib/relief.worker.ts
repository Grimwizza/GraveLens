/**
 * Web Worker for off-thread relief frame processing.
 * Receives raw ArrayBuffers (transferred, not copied) to avoid main-thread stalls.
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

self.onmessage = (e: MessageEvent<WorkerInput>) => {
  const { buffers, width, height } = e.data;
  const numPixels = width * height;
  const numFrames = buffers.length;

  // Wrap each transferred buffer once — avoids repeated allocation in the inner loop
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

  // 2. Contrast stretching
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

  // Transfer the result buffer back — zero-copy
  const result: WorkerOutput = { composite: composite.buffer, width, height };
  (self as unknown as Worker).postMessage(result, [composite.buffer]);
};
