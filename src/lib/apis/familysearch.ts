/**
 * familysearch.ts — FamilySearch record hints.
 *
 * ⚠️ SOURCE UNAVAILABLE (verified July 2026): the Platform records-search
 * API (api.familysearch.org/platform/records/search) returns 404 without an
 * OAuth token, and historical-records access is partner-gated even with one.
 * The previous "free unauthenticated tier" this module was built on does not
 * exist — every call silently failed.
 *
 * Until GraveLens holds a FamilySearch Solution Provider key (see
 * RESEARCH_RELIABILITY_PLAN.md, Option 6), this module returns
 * status "unavailable" plus a fully parameterized deep link into the
 * FamilySearch WEB search — which accepts the same q.* parameters and shows
 * full records to any signed-in user with a free account.
 */

import { unavailableResult, type SourceResult } from "./client";

export interface FamilySearchHint {
  /** Human-readable collection or record title */
  title: string;
  /** Collection date range, e.g. "1880–1940" */
  dateRange?: string;
  /** Record type label, e.g. "Death", "Census", "Military" */
  recordType?: string;
  /** Direct link to the record or collection search on FamilySearch */
  url: string;
  /** Whether the date range aligns with the person's known dates */
  dateConfident: boolean;
}

const FS_WEB_SEARCH = "https://www.familysearch.org/search/record/results";

/**
 * Build a pre-filled FamilySearch web-search URL from person parameters.
 * Shared by the other degraded FamilySearch-backed modules.
 */
export function buildFamilySearchWebUrl(params: {
  firstName?: string;
  lastName?: string;
  birthYear?: number | null;
  deathYear?: number | null;
  collectionId?: string;
  residencePlace?: string;
}): string {
  const q = new URLSearchParams();
  if (params.firstName) q.set("q.givenName", params.firstName);
  if (params.lastName) q.set("q.surname", params.lastName);
  if (params.birthYear) {
    q.set("q.birthLikeDate.from", String(params.birthYear - 2));
    q.set("q.birthLikeDate.to", String(params.birthYear + 2));
  }
  if (params.deathYear) {
    q.set("q.deathLikeDate.from", String(params.deathYear - 1));
    q.set("q.deathLikeDate.to", String(params.deathYear + 1));
  }
  if (params.residencePlace) q.set("q.residencePlace", params.residencePlace);
  if (params.collectionId) q.set("f.collectionId", params.collectionId);
  return `${FS_WEB_SEARCH}?${q}`;
}

export async function searchFamilySearchHints(
  firstName: string,
  lastName: string,
  birthYear: number | null,
  deathYear: number | null
): Promise<SourceResult<FamilySearchHint>> {
  if (!lastName || lastName.length < 2) return unavailableResult();
  return unavailableResult(
    buildFamilySearchWebUrl({ firstName, lastName, birthYear, deathYear })
  );
}
