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
 * Return a data URL with EXIF orientation baked into the pixel data so all
 * subsequent canvas operations work on correctly-oriented pixels.
 *
 * Uses createImageBitmap({ imageOrientation: "from-image" }) which applies
 * the EXIF transform exactly once, independent of the browser's CSS
 * image-orientation default.  Chrome 81+ changed the CSS default to
 * "from-image", which caused the previous manual-transform approach to
 * double-rotate images (portrait photos ended up sideways/upside-down).
 *
 * Falls back to the original data URL if createImageBitmap is unavailable.
 */
export async function correctOrientation(
  file: File,
  dataUrl: string
): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const canvas = document.createElement("canvas");
    canvas.width  = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return dataUrl; }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.95);
  } catch {
    // createImageBitmap unavailable or unsupported options — return original
    return dataUrl;
  }
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
