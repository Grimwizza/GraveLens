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

/**
 * Requests an unauthenticated session access token from the FamilySearch identity server
 * using the configured developer App Key.
 */
async function getUnauthenticatedToken(appKey: string): Promise<string | null> {
  const tokenUrl = process.env.FAMILYSEARCH_AUTH_URL || "https://ident.familysearch.org/cis-web/oauth2/v3/token";
  
  const body = new URLSearchParams({
    grant_type: "unauthenticated_session",
    client_id: appKey,
  });

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.warn(`[FamilySearch Auth] Failed to get unauthenticated token: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.access_token || null;
  } catch (err) {
    console.warn("[FamilySearch Auth] Error fetching access token:", err);
    return null;
  }
}

/**
 * Searches the public FamilySearch Tree to detect if the deceased individual is already
 * documented. Requires confidence >= 0.7 to count as a "tree collision".
 */
export async function checkTreeCollision(
  firstName: string,
  lastName: string,
  birthYear: number | null,
  deathYear: number | null
): Promise<{ hit: boolean; pid?: string; confidence: number; url?: string }> {
  const fallbackUrl = buildFamilySearchWebUrl({ firstName, lastName, birthYear, deathYear });
  
  const appKey = process.env.FAMILYSEARCH_APP_KEY;
  if (!appKey) {
    return { hit: false, confidence: 0, url: fallbackUrl };
  }

  const token = await getUnauthenticatedToken(appKey);
  if (!token) {
    return { hit: false, confidence: 0, url: fallbackUrl };
  }

  const queryParams = new URLSearchParams({
    "q.givenName": firstName,
    "q.surname": lastName,
    count: "3",
  });

  if (birthYear) {
    queryParams.set("q.birthLikeDate.from", `+${birthYear - 2}`);
    queryParams.set("q.birthLikeDate.to", `+${birthYear + 2}`);
  }
  if (deathYear) {
    queryParams.set("q.deathLikeDate.from", `+${deathYear - 2}`);
    queryParams.set("q.deathLikeDate.to", `+${deathYear + 2}`);
  }

  const baseSearchUrl = process.env.FAMILYSEARCH_API_URL || "https://api.familysearch.org";
  const searchUrl = `${baseSearchUrl}/platform/tree/search?${queryParams}`;

  try {
    const res = await fetch(searchUrl, {
      headers: {
        "Accept": "application/x-gedcomx-atom+json",
        "Authorization": `Bearer ${token}`,
        "User-Agent": "GraveLens/1.0 (genealogy research app)",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[FamilySearch Tree Search] Query failed: HTTP ${res.status}`);
      return { hit: false, confidence: 0, url: fallbackUrl };
    }

    const data = await res.json();
    const entries = data.entries || [];

    for (const entry of entries) {
      const person = entry.content?.gedcomx?.persons?.[0];
      if (!person) continue;

      let score = 0;

      // Match name
      const matchedName = person.names?.[0]?.nameForms?.[0]?.fullText || "";
      const lowerMatched = matchedName.toLowerCase();
      if (lowerMatched.includes(firstName.toLowerCase()) && lowerMatched.includes(lastName.toLowerCase())) {
        score += 0.4;
      }

      // Match birth year
      const birthFact = person.facts?.find((f: { type?: string }) => f.type === "http://gedcomx.org/Birth");
      const birthDateStr = birthFact?.date?.original || "";
      const birthMatch = birthDateStr.match(/\b(1[7-9]\d{2}|20\d{2})\b/);
      if (birthMatch && birthYear) {
        const matchingYear = parseInt(birthMatch[1]);
        if (Math.abs(matchingYear - birthYear) <= 2) {
          score += 0.3;
        }
      }

      // Match death year
      const deathFact = person.facts?.find((f: { type?: string }) => f.type === "http://gedcomx.org/Death");
      const deathDateStr = deathFact?.date?.original || "";
      const deathMatch = deathDateStr.match(/\b(1[7-9]\d{2}|20\d{2})\b/);
      if (deathMatch && deathYear) {
        const matchingYear = parseInt(deathMatch[1]);
        if (Math.abs(matchingYear - deathYear) <= 2) {
          score += 0.3;
        }
      }

      if (score >= 0.7) {
        return {
          hit: true,
          pid: person.id,
          confidence: score,
          url: fallbackUrl,
        };
      }
    }

    return { hit: false, confidence: 0, url: fallbackUrl };
  } catch (err) {
    console.warn("[FamilySearch Tree Search] Error querying API:", err);
    return { hit: false, confidence: 0, url: fallbackUrl };
  }
}

