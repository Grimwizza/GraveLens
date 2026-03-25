import type { GraveRecord } from "@/types";

function formatShareText(record: GraveRecord): string {
  const { extracted, location } = record;
  const lines: string[] = [];

  if (extracted.name) lines.push(extracted.name);

  const dateRange = [extracted.birthDate, extracted.deathDate]
    .filter(Boolean)
    .join(" — ");
  if (dateRange) lines.push(dateRange);
  if (extracted.ageAtDeath) lines.push(`Age ${extracted.ageAtDeath}`);
  if (location.cemetery) lines.push(location.cemetery);
  if (location.city && location.state)
    lines.push(`${location.city}, ${location.state}`);
  if (extracted.epitaph) lines.push(`\n"${extracted.epitaph}"`);

  lines.push("\nDiscovered with GraveLens");

  return lines.join("\n");
}

export async function shareGrave(record: GraveRecord): Promise<boolean> {
  const text = formatShareText(record);
  const title = record.extracted.name || "Grave Marker";

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, text });
      return true;
    } catch (err) {
      // User cancelled or share failed
      if ((err as Error).name !== "AbortError") {
        await copyToClipboard(text);
      }
      return false;
    }
  } else {
    await copyToClipboard(text);
    return true;
  }
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
