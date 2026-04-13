/**
 * usgenweb.ts
 * USGenWeb Archives — volunteer-transcribed county genealogical records.
 *
 * Covers probate records, deed books, early census, and local history
 * organized by state and county. Most relevant for 1820–1920 deaths in
 * rural counties where state vital records registration had not yet begun.
 *
 * Strategy:
 *   1. Construct the county index URL (usgwarchives.net/{state}/{county}/)
 *   2. Attempt a lightweight HTML fetch (5 s timeout)
 *   3. Parse <a> tags for links whose text contains genealogical keywords
 *   4. Fall back to the county page URL as a general pointer if fetch fails
 *
 * Fires only when deathYear < 1920 and county + state are known.
 * Caller should additionally gate on landRecords.length > 0 (per roadmap).
 *
 * Public source: https://usgwarchives.net/ — entirely free, no API key.
 */

import type { UsGenWebRecord } from "@/types";

// ── Keyword → record-type mapping ────────────────────────────────────────────

const KEYWORD_MAP: Array<[string, UsGenWebRecord["recordType"]]> = [
  ["probate",   "probate"],
  ["estate",    "probate"],
  ["will",      "will"],
  ["testament", "will"],
  ["deed",      "deed"],
  ["grantor",   "deed"],
  ["grantee",   "deed"],
  ["land",      "deed"],
  ["directory", "directory"],
];

function classifyText(text: string): UsGenWebRecord["recordType"] | null {
  const lower = text.toLowerCase();
  for (const [kw, type] of KEYWORD_MAP) {
    if (lower.includes(kw)) return type;
  }
  return null;
}

/** Normalize to USGenWeb's URL slug convention: lowercase, no spaces/punctuation. */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Search USGenWeb county archives for probate, deed, and will records.
 *
 * @param county    County name (with or without "County" suffix)
 * @param state     Full state name (e.g. "Wisconsin")
 * @param deathYear Death year from OCR — gates the search to pre-1920
 */
export async function searchUsGenWebRecords(
  county: string | undefined,
  state: string | undefined,
  deathYear?: number | null,
): Promise<UsGenWebRecord[]> {
  if (!county || !state) return [];
  if (deathYear && deathYear >= 1920) return [];

  const stateSlug  = slug(state);
  const countySlug = slug(county.replace(/\s*county\s*/i, ""));
  const baseUrl    = `https://usgwarchives.net/${stateSlug}/${countySlug}/`;

  const fallback: UsGenWebRecord = {
    title:      `${county}, ${state} — USGenWeb Archives`,
    county,
    state,
    recordType: "general",
    url:        baseUrl,
  };

  try {
    const res = await fetch(baseUrl, {
      signal:  AbortSignal.timeout(5000),
      headers: { "User-Agent": "GraveLens/1.0 genealogical-research-tool" },
    });
    if (!res.ok) return [fallback];

    const html = await res.text();

    // Match <a href="...">link text</a> — liberal but sufficient for USGenWeb's simple HTML
    const linkRe = /<a\s[^>]*href="([^"#][^"]*)"[^>]*>([^<]{3,80})<\/a>/gi;
    const seen   = new Set<string>();
    const records: UsGenWebRecord[] = [];
    let match: RegExpExecArray | null;

    while ((match = linkRe.exec(html)) !== null && records.length < 8) {
      const [, href, rawText] = match;
      const text       = rawText.replace(/\s+/g, " ").trim();
      const recordType = classifyText(text);
      if (!recordType) continue;

      // Resolve relative URLs against the base page
      let url: string;
      try {
        url = href.startsWith("http") ? href : new URL(href, baseUrl).href;
      } catch {
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);

      records.push({ title: text, county, state, recordType, url });
    }

    return records.length > 0 ? records : [fallback];
  } catch {
    return [fallback];
  }
}
