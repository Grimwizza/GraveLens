const isWebpSupported = (() => {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  } catch {
    return false;
  }
})();

/**
 * Resize a data URL so the longest edge is at most 1200 px at 80% JPEG/WebP quality.
 * Used for the photoDataUrl stored in IndexedDB (archive thumbnail).
 * Shared between CapturePage and PhotoEditorModal.
 */
export function resizeForStorage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxPx = 1200;
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, w, h);
      const format = isWebpSupported ? "image/webp" : "image/jpeg";
      resolve(canvas.toDataURL(format, 0.80));
    };
    img.onerror = () => reject(new Error("Failed to load image for storage resizing"));
    img.src = dataUrl;
  });
}

/**
 * Generate a small preview thumbnail (300 px longest edge, 65% JPEG/WebP).
 * Used in archive list/tile/coverflow views to avoid parsing the full photo on each render.
 */
export function generateThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxPx = 300;
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas unavailable"));
      ctx.drawImage(img, 0, 0, w, h);
      const format = isWebpSupported ? "image/webp" : "image/jpeg";
      resolve(canvas.toDataURL(format, 0.65));
    };
    img.onerror = () => reject(new Error("Failed to load image for thumbnail"));
    img.src = dataUrl;
  });
}

/**
 * Save a photo to the device camera roll (mobile) or trigger a file download (desktop).
 * On iOS/Android uses Web Share API Level 2 — the OS share sheet appears and the user
 * taps "Save Image". On desktop falls back to an <a download> link.
 * Silently no-ops if the user dismisses or the API is unavailable.
 */
export async function saveToDevice(dataUrl: string, filename: string): Promise<void> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || "image/jpeg" });

    if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "GraveLens Photo" });
    } else {
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch {
    // Share dismissed or unsupported — not an error from the user's perspective
  }
}
