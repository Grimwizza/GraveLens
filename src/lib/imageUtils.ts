/**
 * Resize a data URL so the longest edge is at most 1200 px at 80% JPEG quality.
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
      resolve(canvas.toDataURL("image/jpeg", 0.80));
    };
    img.onerror = () => reject(new Error("Failed to load image for storage resizing"));
    img.src = dataUrl;
  });
}
