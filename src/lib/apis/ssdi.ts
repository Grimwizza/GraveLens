/**
 * ssdi.ts — Social Security Death Index (1936–2014).
 *
 * ⚠️ SOURCE UNAVAILABLE (verified July 2026): this rode on the FamilySearch
 * Platform records-search API, which 404s without OAuth partner access.
 * See familysearch.ts for the full explanation.
 *
 * Returns status "unavailable" plus a deep link into the FamilySearch web
 * search scoped to the SSDI collection — free account shows full records
 * (confirmed death date, last residence, birth date).
 */

import { unavailableResult, type SourceResult } from "./client";
import { buildFamilySearchWebUrl } from "./familysearch";

export interface SSDIRecord {
  /** Full name as indexed in the SSDI */
  name: string;
  /** Birth date string as recorded in the SSDI */
  birthDate?: string;
  /** Death date string as recorded in the SSDI */
  deathDate?: string;
  /** Last known residence state (e.g. "Wisconsin") */
  lastResidenceState?: string;
  /** Confidence that this is the right person: "high" | "medium" | "low" */
  matchConfidence: "high" | "medium" | "low";
  /** Direct link to SSDI record on FamilySearch */
  url: string;
}

const SSDI_COLLECTION = "2437639";

export async function searchSSdI(
  firstName: string,
  lastName: string,
  birthYear: number | null,
  deathYear: number | null
): Promise<SourceResult<SSDIRecord>> {
  // SSDI only covers 1936–2014 — outside that window the source simply
  // doesn't apply, so report "empty" rather than "unavailable".
  if (!deathYear || deathYear < 1936 || deathYear > 2014)
    return { status: "empty", records: [] };
  if (!lastName || lastName.length < 2) return { status: "empty", records: [] };

  return unavailableResult(
    buildFamilySearchWebUrl({
      firstName,
      lastName,
      birthYear,
      deathYear,
      collectionId: SSDI_COLLECTION,
    })
  );
}
