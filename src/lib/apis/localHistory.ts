// Options A + B: Wikipedia city/county article summaries and decade snapshots.
// Uses the same Wikipedia REST API already in use for year-event lookups.

import type { WikipediaArticle, DecadeSnapshot } from "@/types";

const WP_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary";

async function fetchWikiSummary(title: string): Promise<string | null> {
  try {
    const res = await fetch(`${WP_SUMMARY}/${encodeURIComponent(title)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.extract as string) || null;
  } catch {
    return null;
  }
}

// Strip calendar/meta noise — same filter used for year event lookups.
const CALENDAR_NOISE =
  /leap year|common year|starting on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|Gregorian calendar|Julian calendar|Anno Domini|\bAD\b|\bCE\b|Common Era|millennium|century|decade|year of the \d/i;

function extractSentences(text: string, max = 5): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 40 &&
        s.length < 500 &&
        !CALENDAR_NOISE.test(s) &&
        /^[A-Z]/.test(s)
    )
    .slice(0, max);
}

// ── Option A: City / county Wikipedia article ─────────────────────────────────

export async function getCityContext(
  city: string | undefined,
  county: string | undefined,
  state: string | undefined
): Promise<{ cityArticle?: WikipediaArticle; countyArticle?: WikipediaArticle }> {
  const results: { cityArticle?: WikipediaArticle; countyArticle?: WikipediaArticle } = {};

  if (city && state) {
    // Try several article title formats in order of specificity
    const cityTitles = [
      `${city}, ${state}`,
      `History of ${city}, ${state}`,
      `${city}`,
    ];

    for (const title of cityTitles) {
      const text = await fetchWikiSummary(title);
      if (text && text.length > 100) {
        results.cityArticle = {
          title,
          summary: text.slice(0, 800),
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        };
        break;
      }
    }
  }

  if (county && state) {
    // Nominatim often returns county names like "Dane County" — strip the word
    const countyName = county.replace(/\s+County$/i, "").trim();
    const countyTitles = [
      `${countyName} County, ${state}`,
      `History of ${countyName} County, ${state}`,
    ];

    for (const title of countyTitles) {
      const text = await fetchWikiSummary(title);
      if (text && text.length > 100) {
        results.countyArticle = {
          title,
          summary: text.slice(0, 600),
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        };
        break;
      }
    }
  }

  return results;
}

// ── Option B: Decade snapshots for state ─────────────────────────────────────
// Picks up to 4 evenly-spaced decades across the person's adult lifespan
// (age 15–death) to give a rolling picture of the era they inhabited.

export async function getDecadeSnapshots(
  state: string | undefined,
  birthYear: number | null,
  deathYear: number | null
): Promise<DecadeSnapshot[]> {
  if (!state || !birthYear || !deathYear || deathYear <= birthYear) return [];

  const adultStart = birthYear + 15;
  const end = deathYear;
  if (adultStart >= end) return [];

  // Collect all decades spanned during adult life
  const startDecade = Math.floor(adultStart / 10) * 10;
  const endDecade = Math.floor(end / 10) * 10;
  const allDecades: number[] = [];
  for (let d = startDecade; d <= endDecade; d += 10) {
    allDecades.push(d);
  }

  // Sample up to 4 evenly spaced — more gives diminishing returns and too many API calls
  const sampled = sampleEvenly(allDecades, 4);

  const stateSlug = state.trim().replace(/\s+/g, "_");

  const snapshots = await Promise.all(
    sampled.map(async (decade) => {
      const label = `${decade}s in ${state}`;
      const slug = `${decade}s_in_${stateSlug}`;
      const text = await fetchWikiSummary(slug);
      if (!text) return null;
      const events = extractSentences(text, 4);
      if (events.length === 0) return null;
      return { label, events } satisfies DecadeSnapshot;
    })
  );

  return snapshots.filter((s): s is DecadeSnapshot => s !== null);
}

function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = (arr.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => arr[Math.round(i * step)]);
}
