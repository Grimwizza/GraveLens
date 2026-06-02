/**
 * conflictDetector.ts
 * Zero-cost, deterministic conflict detection across research sources.
 *
 * Compares dates and names across: extracted stone data, SSDI records,
 * historical census (age back-calculated), and newspaper death mentions.
 * Returns a list of conflicts for display — never throws, never calls an API.
 */

import type { ExtractedGraveData, ResearchData } from "@/types";

export interface DataConflict {
  field: "birthYear" | "deathYear" | "name";
  source1: string;
  value1: string;
  source2: string;
  value2: string;
  /** How many years apart — only set for year fields */
  deltaYears?: number;
}

const YEAR_TOLERANCE = 1; // ±1 year is common due to census under/over-reporting

function parseYear(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

function yearConflict(
  y1: number | null,
  src1: string,
  y2: number | null,
  src2: string,
  field: "birthYear" | "deathYear"
): DataConflict | null {
  if (y1 == null || y2 == null) return null;
  const delta = Math.abs(y1 - y2);
  if (delta <= YEAR_TOLERANCE) return null;
  return {
    field,
    source1: src1,
    value1: String(y1),
    source2: src2,
    value2: String(y2),
    deltaYears: delta,
  };
}

export function detectConflicts(
  extracted: ExtractedGraveData,
  research: ResearchData
): DataConflict[] {
  const conflicts: DataConflict[] = [];

  const stoneBirth = parseYear(extracted.birthYear);
  const stoneDeath = parseYear(extracted.deathYear);

  // ── SSDI vs stone ─────────────────────────────────────────────────────────
  for (const ssdi of research.ssdi ?? []) {
    if (ssdi.matchConfidence === "low") continue; // only flag medium+ matches

    // Death year
    const ssdiDeath = parseYear(ssdi.deathDate?.match(/\d{4}/)?.[0]);
    const dc = yearConflict(stoneDeath, "Headstone", ssdiDeath, "SSDI record", "deathYear");
    if (dc) conflicts.push(dc);

    // Birth year
    const ssdiBirth = parseYear(ssdi.birthDate?.match(/\d{4}/)?.[0]);
    const bc = yearConflict(stoneBirth, "Headstone", ssdiBirth, "SSDI record", "birthYear");
    if (bc) conflicts.push(bc);
  }

  // ── Newspaper death date vs stone ─────────────────────────────────────────
  for (const article of research.newspapers ?? []) {
    const dateStr = article.date ?? "";
    const articleYear = parseYear(dateStr.match(/\d{4}/)?.[0]);
    if (!articleYear) continue;
    // Obituaries appear within 1–2 years of death — flag if 3+ years off
    const dc = yearConflict(stoneDeath, "Headstone", articleYear, `Newspaper article (${dateStr.slice(0, 10)})`, "deathYear");
    if (dc && dc.deltaYears != null && dc.deltaYears >= 3) {
      conflicts.push(dc);
    }
  }

  // Deduplicate: keep only the most significant conflict per field
  const seen = new Map<string, DataConflict>();
  for (const c of conflicts) {
    const key = c.field;
    const existing = seen.get(key);
    if (!existing || (c.deltaYears ?? 0) > (existing.deltaYears ?? 0)) {
      seen.set(key, c);
    }
  }

  return [...seen.values()];
}
