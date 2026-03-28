export interface ExifLocation {
  lat: number;
  lng: number;
}

export async function extractExifLocation(
  file: File
): Promise<ExifLocation | null> {
  try {
    const exifr = (await import("exifr")).default;
    const gps = await exifr.gps(file);
    if (gps && gps.latitude && gps.longitude) {
      return { lat: gps.latitude, lng: gps.longitude };
    }
    return null;
  } catch {
    return null;
  }
}

export async function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Read the EXIF Orientation tag and return a data URL with the rotation
 * baked into the pixel data.  All subsequent canvas operations (resize,
 * preprocess, crop) then work on correctly-oriented pixels without needing
 * to know about EXIF at all.
 *
 * EXIF orientation values:
 *   1 = normal  2 = flip-H  3 = 180°  4 = flip-V
 *   5 = transpose  6 = 90° CW  7 = transverse  8 = 90° CCW
 *
 * Returns the original data URL unchanged if orientation is 1 / unknown.
 */
export async function correctOrientation(
  file: File,
  dataUrl: string
): Promise<string> {
  let orientation = 1;
  try {
    const exifr = (await import("exifr")).default;
    const result = await exifr.parse(file, ["Orientation"]);
    orientation = result?.Orientation ?? 1;
  } catch {
    // exifr unavailable or no EXIF — treat as normal
  }

  if (orientation === 1) return dataUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const swapped = orientation >= 5 && orientation <= 8;

      const canvas = document.createElement("canvas");
      canvas.width  = swapped ? h : w;
      canvas.height = swapped ? w : h;

      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));

      // Apply the 2-D transform that undoes the EXIF rotation/flip
      switch (orientation) {
        case 2: ctx.transform(-1,  0,  0,  1,  w,  0); break; // flip H
        case 3: ctx.transform(-1,  0,  0, -1,  w,  h); break; // 180°
        case 4: ctx.transform( 1,  0,  0, -1,  0,  h); break; // flip V
        case 5: ctx.transform( 0,  1,  1,  0,  0,  0); break; // transpose
        case 6: ctx.transform( 0,  1, -1,  0,  h,  0); break; // 90° CW
        case 7: ctx.transform( 0, -1, -1,  0,  h,  w); break; // transverse
        case 8: ctx.transform( 0, -1,  1,  0,  0,  w); break; // 90° CCW
      }

      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
