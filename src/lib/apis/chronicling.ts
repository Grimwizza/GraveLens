import type { NewspaperArticle } from "@/types";

const BASE = "https://chroniclingamerica.loc.gov";

// Chronicling America covers 1770–1963 only.
// Searches outside this range will never return results.
const ARCHIVE_END_YEAR = 1963;

export async function searchNewspapers(
  name: string,
  deathYear: number | null,
  state?: string
): Promise<NewspaperArticle[]> {
  if (!name || name.length < 3) return [];
  // Skip the API call entirely for post-1963 deaths — archive ends there.
  if (deathYear && deathYear > ARCHIVE_END_YEAR + 2) return [];

  // Search by full name for precision; single-word names fall back to just the name.
  const parts = name.trim().split(/\s+/);
  const searchName = parts.length >= 2
    ? `"${parts[0]}" "${parts[parts.length - 1]}"`
    : `"${name}"`;

  // Widen the window to ±2 years to catch delayed obituaries and memorial notices.
  const yearFrom = deathYear ? deathYear - 1 : undefined;
  const yearTo = deathYear ? Math.min(deathYear + 2, ARCHIVE_END_YEAR) : undefined;

  const params = new URLSearchParams({
    proxtext: searchName,
    format: "json",
    rows: "5",
    sort: "relevance",
  });

  if (yearFrom) params.set("date1", String(yearFrom));
  if (yearTo) params.set("date2", String(yearTo));
  // Chronicling America expects the full state name (e.g. "Wisconsin")
  if (state) params.set("state", state);

  try {
    const res = await fetch(`${BASE}/search/pages/results/?${params}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const items: Array<{
      title_normal?: string;
      date?: string;
      title?: string;
      url?: string;
      ocr_eng?: string;
      place_of_publication?: string;
    }> = data.items ?? [];

    return items.slice(0, 5).map((item) => ({
      // title = newspaper name; title_normal is a lowercase-normalized form
      title: item.title ?? item.title_normal ?? "Untitled",
      date: item.date ? formatChronDate(item.date) : "",
      newspaper: item.title ?? "",
      location: item.place_of_publication ?? "",
      url: item.url ? `${BASE}${item.url}` : BASE,
      snippet: item.ocr_eng
        ? item.ocr_eng.slice(0, 300).replace(/\s+/g, " ").trim()
        : "",
    }));
  } catch {
    return [];
  }
}

/** Chronicling America returns dates as "YYYYMMDD" — format for display. */
function formatChronDate(raw: string): string {
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}
