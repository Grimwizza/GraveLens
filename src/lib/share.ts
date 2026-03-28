import type { GraveRecord } from "@/types";

function formatShareText(record: GraveRecord): string {
  const { extracted, location, research } = record;
  const lines: string[] = [];

  if (extracted.name) lines.push(extracted.name);

  const dateRange = [extracted.birthDate, extracted.deathDate]
    .filter(Boolean)
    .join(" – ");
  if (dateRange) lines.push(dateRange);
  if (extracted.ageAtDeath) lines.push(`Age ${extracted.ageAtDeath}`);

  if (location?.cemetery) lines.push(location.cemetery);
  if (location?.city && location?.state)
    lines.push(`${location.city}, ${location.state}`);

  if (extracted.epitaph) lines.push(`\n"${extracted.epitaph}"`);
  if (extracted.inscription && extracted.inscription !== extracted.epitaph) {
    const trimmed = extracted.inscription.slice(0, 200);
    lines.push(`\nInscription: ${trimmed}${extracted.inscription.length > 200 ? "…" : ""}`);
  }

  const mil = research?.militaryContext;
  if (mil?.likelyConflict) {
    const parts = [mil.likelyConflict, mil.role]
      .filter(Boolean)
      .join(", ");
    lines.push(`\n${parts}`);
  }

  const hist = research?.historical;
  if (hist?.birthEra || hist?.deathEra) {
    const era = [hist.birthEra, hist.deathEra].filter(Boolean).join(" – ");
    lines.push(`Era: ${era}`);
  }

  lines.push("\nDiscovered with GraveLens · https://gravelens.com");

  return lines.join("\n");
}

/**
 * Convert a data URL to a File object for use with the Web Share API.
 * Returns null if the data URL is invalid.
 */
function dataUrlToFile(dataUrl: string, filename: string): File | null {
  try {
    const [header, base64] = dataUrl.split(",");
    const mimeMatch = header.match(/:(.*?);/);
    if (!mimeMatch || !base64) return null;
    const mime = mimeMatch[1];
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new File([arr], filename, { type: mime });
  } catch {
    return null;
  }
}

export async function shareGrave(record: GraveRecord): Promise<boolean> {
  const text = formatShareText(record);
  const title = record.extracted.name || "Grave Marker";

  if (typeof navigator === "undefined" || !navigator.share) {
    await copyToClipboard(text);
    return true;
  }

  // Build share payload — include image file when the browser supports it
  const filename = `${title.replace(/[^a-z0-9]/gi, "_")}.jpg`;
  const imageFile = record.photoDataUrl
    ? dataUrlToFile(record.photoDataUrl, filename)
    : null;

  const canShareFiles =
    imageFile &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [imageFile] });

  try {
    if (canShareFiles && imageFile) {
      await navigator.share({ title, text, files: [imageFile] });
    } else {
      await navigator.share({ title, text });
    }
    return true;
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      await copyToClipboard(text);
    }
    return false;
  }
}

/**
 * Save the grave photo to the device's photo library via the Web Share API.
 * On iOS this triggers the system share sheet which includes "Save Image".
 * Returns true if the share sheet was opened successfully.
 */
export async function savePhotoToDevice(
  photoDataUrl: string,
  name: string
): Promise<boolean> {
  if (typeof navigator === "undefined") return false;

  const filename = `${(name || "grave-marker").replace(/[^a-z0-9]/gi, "_")}.jpg`;
  const file = dataUrlToFile(photoDataUrl, filename);
  if (!file) return false;

  if (
    navigator.share &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: name || "Grave Marker" });
      return true;
    } catch (err) {
      if ((err as Error).name === "AbortError") return false;
    }
  }

  // Fallback: trigger a download
  const a = document.createElement("a");
  a.href = photoDataUrl;
  a.download = filename;
  a.click();
  return true;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

export function buildEmailShareUrl(record: GraveRecord): string {
  const text = formatShareText(record);
  const subject = encodeURIComponent(
    `${record.extracted.name || "Grave Marker"} | GraveLens`
  );
  const body = encodeURIComponent(text);
  return `mailto:?subject=${subject}&body=${body}`;
}

export function buildSmsShareUrl(record: GraveRecord): string {
  const text = formatShareText(record);
  return `sms:?body=${encodeURIComponent(text)}`;
}
