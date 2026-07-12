/**
 * chronicling.ts — historic newspaper search via the loc.gov API.
 *
 * The legacy Chronicling America API (chroniclingamerica.loc.gov/search/…)
 * was retired on 2025-08-04 and now 404s. This module uses the replacement:
 *
 *   https://www.loc.gov/collections/chronicling-america/?q=…&fo=json
 *
 * Verified working parameters (July 2026):
 *   q=<terms>                       full-text search; quote for phrase
 *   dates=YYYY-MM-DD/YYYY-MM-DD     inclusive range (day precision works)
 *   fa=location_state:<state>       lowercase full state name
 *   c=<n>                           result count
 *   at=results,pagination           trims payload from ~1.8 MB to ~14 KB
 *
 * NOTE: the tutorial-documented `qs=`/`ops=`/`start_date=` params are
 * silently IGNORED by this endpoint — only q/dates/fa filter correctly.
 *
 * Coverage: 1770–1963. OCR text arrives in `description[0]`; `url` deep-links
 * to the scanned page with the search term highlighted.
 */

import type { NewspaperArticle } from "@/types";
import { fetchSourceJson, okResult, failedResult, type SourceResult } from "./client";

const BASE = "https://www.loc.gov/collections/chronicling-america/";
const ARCHIVE_END_YEAR = 1963;

interface LocResult {
  title?: string;
  date?: string;
  url?: string;
  description?: string[];
  partof_title?: string[];
  location_city?: string[];
  location_state?: string[];
}

interface LocResponse {
  results?: LocResult[];
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

/** "warren sheaf (warren, marshall county, minn.) 1880-current" → "Warren Sheaf" */
function cleanNewspaperTitle(partof: string | undefined, fallback: string): string {
  if (!partof) return fallback;
  const base = partof.split("(")[0].trim();
  return base
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ") || fallback;
}

function buildParams(query: string, datesRange: string | undefined, state: string | undefined, rows: number): URLSearchParams {
  const params = new URLSearchParams({
    q: query,
    fo: "json",
    c: String(rows),
    at: "results,pagination",
  });
  if (datesRange) params.set("dates", datesRange);
  if (state) params.set("fa", `location_state:${state.toLowerCase()}`);
  return params;
}

function mapResults(items: LocResult[], snippetQuery: string): NewspaperArticle[] {
  return items.slice(0, 5).map((item) => ({
    title: item.title ?? "Untitled",
    date: item.date ?? "",
    newspaper: cleanNewspaperTitle(item.partof_title?.[0], item.title ?? ""),
    location: [item.location_city?.[0], item.location_state?.[0]]
      .filter(Boolean)
      .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
      .join(", "),
    url: item.url ?? BASE,
    snippet: item.description?.[0]
      ? extractContextSnippet(item.description[0], snippetQuery)
      : "",
  }));
}

export interface NewspaperSearchOptions {
  /** Best full name, e.g. "William Larson" */
  name: string;
  /** Alternate full names to widen with when the primary phrase finds nothing */
  altNames?: string[];
  deathYear: number | null;
  /** ISO yyyy-mm-dd when the stone gives an exact death date */
  deathDateIso?: string;
  state?: string;
}

/**
 * Search for the person by name — obituaries, death notices, mentions.
 * Precise first (exact phrase, tight window from the death date), widened
 * with one alternate name if the primary search comes back empty.
 */
export async function searchNewspapers(
  opts: NewspaperSearchOptions
): Promise<SourceResult<NewspaperArticle>> {
  const { name, altNames = [], deathYear, deathDateIso, state } = opts;
  if (!name || name.length < 3) return okResult([]);
  // Archive ends in 1963 — skip post-1965 deaths entirely.
  if (deathYear && deathYear > ARCHIVE_END_YEAR + 2) return okResult([]);

  // Obituaries run from the death date to a few months after; when we only
  // know the year, widen to catch delayed memorial notices.
  let datesRange: string | undefined;
  if (deathDateIso) {
    const d = new Date(deathDateIso);
    if (!isNaN(d.getTime())) {
      const end = new Date(d);
      end.setDate(end.getDate() + 120);
      datesRange = `${deathDateIso}/${end.toISOString().slice(0, 10)}`;
    }
  }
  if (!datesRange && deathYear) {
    datesRange = `${deathYear - 1}/${Math.min(deathYear + 2, ARCHIVE_END_YEAR)}`;
  }

  const attempts = [name, ...altNames.filter((n) => n !== name)].slice(0, 2);
  const htmlFallback = `${BASE}?${buildParams(`"${name}"`, datesRange, state, 5)}`.replace("fo=json&", "");

  for (const attemptName of attempts) {
    const params = buildParams(`"${attemptName}"`, datesRange, state, 5);
    const outcome = await fetchSourceJson<LocResponse>(`${BASE}?${params}`, {
      source: "loc-newspapers",
      timeoutMs: 12000,
    });

    if (!outcome.ok) return failedResult(htmlFallback);

    const items = outcome.data.results ?? [];
    if (items.length > 0) return okResult(mapResults(items, attemptName));
  }

  return okResult([]);
}

// ── Local area event search ───────────────────────────────────────────────────
// Search the archive for community events in the person's city/county during
// their lifespan — not for the person's name, but for what was happening around
// them. Context feature: failures degrade to an empty list.

export async function searchLocalAreaNews(
  city: string | undefined,
  county: string | undefined,
  state: string | undefined,
  birthYear: number | null,
  deathYear: number | null
): Promise<NewspaperArticle[]> {
  const effectiveEnd = Math.min(deathYear ?? ARCHIVE_END_YEAR, ARCHIVE_END_YEAR);
  const effectiveStart = birthYear ? Math.min(birthYear, ARCHIVE_END_YEAR) : 1770;
  if (effectiveStart > effectiveEnd) return [];

  const geoTerm = city || county;
  if (!geoTerm || geoTerm.length < 3) return [];

  const params = buildParams(
    `"${geoTerm}"`,
    `${effectiveStart}/${effectiveEnd}`,
    state,
    5
  );

  const outcome = await fetchSourceJson<LocResponse>(`${BASE}?${params}`, {
    source: "loc-local-news",
    timeoutMs: 12000,
  });

  if (!outcome.ok) return [];
  return mapResults(outcome.data.results ?? [], geoTerm);
}
