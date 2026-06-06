import type { NewspaperArticle } from "@/types";

const BASE = "https://chroniclingamerica.loc.gov";

// Chronicling America covers 1770–1963 only.
// Searches outside this range will never return results.
const ARCHIVE_END_YEAR = 1963;

/**
 * Build a URL-safe Chronicling America link.
 * The API returns item.url as a relative path ("/lccn/…") but occasionally
 * returns absolute URLs in some response variants — guard both cases.
 */
function toChronUrl(url: string | undefined): string {
  if (!url) return `${BASE}/search/pages/results/`;
  return url.startsWith("http") ? url : `${BASE}${url}`;
}

/**
 * Find the portion of OCR text closest to the search term rather than
 * returning the first 300 characters (which is usually the page banner).
 */
function extractContextSnippet(ocr: string, query: string, windowChars = 250): string {
  const lower = ocr.toLowerCase();
  const parts = query.trim().replace(/"/g, "").split(/\s+/);
  // Prefer the last name (rightmost token) — most reliable in historical OCR
  const searchFor = parts.length >= 2 ? parts[parts.length - 1].toLowerCase() : parts[0]?.toLowerCase() ?? "";
  const idx = searchFor ? lower.indexOf(searchFor) : -1;
  if (idx === -1) return ocr.slice(0, 300).replace(/\s+/g, " ").trim();
  const start = Math.max(0, idx - 80);
  const end = Math.min(ocr.length, idx + windowChars);
  const raw = ocr.slice(start, end).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + raw + (end < ocr.length ? "…" : "");
}

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
      url: toChronUrl(item.url),
      snippet: item.ocr_eng ? extractContextSnippet(item.ocr_eng, searchName) : "",
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

// ── Option C: Local area event search ────────────────────────────────────────
// Search the archive for community events in the person's city/county during
// their lifespan — not for the person's name, but for what was happening around
// them. Yields coverage of local disasters, civic milestones, industry news, etc.

export async function searchLocalAreaNews(
  city: string | undefined,
  county: string | undefined,
  state: string | undefined,
  birthYear: number | null,
  deathYear: number | null
): Promise<NewspaperArticle[]> {
  // Only useful within the archive's coverage window.
  // Clamp effectiveStart to ARCHIVE_END_YEAR so a post-1963 birthYear doesn't
  // produce an invalid date range — local area history up to 1963 is still relevant.
  const effectiveEnd = Math.min(deathYear ?? ARCHIVE_END_YEAR, ARCHIVE_END_YEAR);
  const effectiveStart = birthYear ? Math.min(birthYear, ARCHIVE_END_YEAR) : 1770;
  if (effectiveStart > effectiveEnd) return [];

  // Build a geographic search term — prefer specific city, fall back to county
  const geoTerm = city || county;
  if (!geoTerm || geoTerm.length < 3) return [];

  const params = new URLSearchParams({
    proxtext: `"${geoTerm}"`,
    format: "json",
    rows: "5",
    sort: "relevance",
  });

  params.set("date1", String(effectiveStart));
  params.set("date2", String(effectiveEnd));
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
      title: item.title ?? item.title_normal ?? "Untitled",
      date: item.date ? formatChronDate(item.date) : "",
      newspaper: item.title ?? "",
      location: item.place_of_publication ?? "",
      url: toChronUrl(item.url),
      snippet: item.ocr_eng ? extractContextSnippet(item.ocr_eng, geoTerm) : "",
    }));
  } catch {
    return [];
  }
}
