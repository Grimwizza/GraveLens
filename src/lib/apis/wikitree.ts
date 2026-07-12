/**
 * wikitree.ts — WikiTree public profile search.
 *
 * WikiTree exposes a genuinely open JSON API (no key, no OAuth) for public
 * profiles, unlike the gated FamilySearch/Ancestry APIs. That means real
 * researched facts — dates, birth/death places, family-tree links — land
 * inline in the archive record, not just a deep link.
 *
 * The `searchPerson` action's name filter is loose (a query for "John
 * Larson" can return "Hans Larson"), so every candidate is scored against
 * the stone's identity via scoreCandidate(); only medium/high matches are
 * returned, each carrying its confidence and the plain-English reasons.
 *
 * API docs: https://github.com/wikitree/wikitree-api
 */

import { fetchSourceJson, okResult, failedResult, type SourceResult } from "./client";
import { scoreCandidate, type PersonQuery } from "@/lib/research/personQuery";

export interface WikiTreeMatch {
  /** WikiTree ID, e.g. "Larson-6533" */
  wikitreeId: string;
  /** Full name as recorded on WikiTree */
  name: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  deathPlace?: string;
  /** Direct link to the public profile (full tree, sources) */
  url: string;
  /** Match confidence against the scanned stone */
  confidence: "high" | "medium" | "low";
  /** Plain-English match evidence, e.g. "exact birth year", "state matches" */
  reasons: string[];
}

const API = "https://api.wikitree.com/api.php";
// appId identifies the app to avoid the strict anonymous rate limit.
const APP_ID = "GraveLens";

interface WtMatch {
  Name?: string;
  FirstName?: string;
  LastName?: string;
  BirthDate?: string;
  DeathDate?: string;
  BirthLocation?: string;
  DeathLocation?: string;
}

type WtResponse = Array<{ status?: number | string; matches?: WtMatch[] }>;

/** WikiTree encodes unknown dates as "0000-00-00" and years as 0. */
export function cleanDate(d: string | undefined): string | undefined {
  if (!d || d.startsWith("0000")) return undefined;
  return d;
}

export function yearOf(d: string | undefined): number | null {
  const clean = cleanDate(d);
  const m = clean?.match(/^(\d{4})/);
  const y = m ? parseInt(m[1], 10) : 0;
  return y > 0 ? y : null;
}

/**
 * WikiTree IDs are `LastNameAtBirth-Number` (e.g. "Larson-6533",
 * "Van_Buren-1"). searchPerson frequently returns an empty LastName field,
 * so recover the surname from the ID — without it, scoreCandidate wrongly
 * penalizes every match as "surname differs".
 */
export function surnameFromId(id: string): string {
  return id.replace(/-\d+$/, "").replace(/_/g, " ").trim();
}

/** Last comma-separated segment before "United States" is usually the state. */
export function stateFromPlace(place: string | undefined): string | undefined {
  if (!place) return undefined;
  const parts = place.split(",").map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!p || /united states|usa|us/i.test(p)) continue;
    return p;
  }
  return undefined;
}

export async function searchWikiTree(q: PersonQuery): Promise<SourceResult<WikiTreeMatch>> {
  const firstName = q.givenNames[0];
  const lastName = q.surnames[0];
  if (!lastName || lastName.length < 2) return okResult([]);

  const params = new URLSearchParams({
    action: "searchPerson",
    FirstName: firstName ?? "",
    LastName: lastName,
    fields: "Name,FirstName,LastName,BirthDate,DeathDate,BirthLocation,DeathLocation",
    appId: APP_ID,
    limit: "10",
  });
  if (q.birth?.year) params.set("BirthDate", String(q.birth.year));
  if (q.death?.year) params.set("DeathDate", String(q.death.year));

  const outcome = await fetchSourceJson<WtResponse>(`${API}?${params}`, {
    source: "wikitree",
    timeoutMs: 10000,
  });

  const profileFallback = `https://www.wikitree.com/wiki/Special:SearchPerson?Query=${encodeURIComponent(
    `${firstName ?? ""} ${lastName}`.trim()
  )}`;

  if (!outcome.ok) return failedResult(profileFallback);

  const matches = outcome.data?.[0]?.matches ?? [];

  const scored: WikiTreeMatch[] = [];
  for (const m of matches) {
    if (!m.Name) continue; // API pads results with index-only stubs

    const surname = m.LastName || surnameFromId(m.Name);
    const displayName = [m.FirstName, surname].filter(Boolean).join(" ").trim() || surname;

    const score = scoreCandidate(
      {
        name: displayName,
        birthYear: yearOf(m.BirthDate),
        deathYear: yearOf(m.DeathDate),
        state: stateFromPlace(m.DeathLocation) ?? stateFromPlace(m.BirthLocation),
      },
      q
    );

    // Drop low-confidence noise — the loose name filter surfaces unrelated people.
    if (score.confidence === "low") continue;

    scored.push({
      wikitreeId: m.Name,
      name: displayName,
      birthDate: cleanDate(m.BirthDate),
      deathDate: cleanDate(m.DeathDate),
      birthPlace: m.BirthLocation || undefined,
      deathPlace: m.DeathLocation || undefined,
      url: `https://www.wikitree.com/wiki/${encodeURIComponent(m.Name)}`,
      confidence: score.confidence,
      reasons: score.reasons,
    });
  }

  // Best matches first (high before medium), cap at 3.
  scored.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : 1));
  return okResult(scored.slice(0, 3));
}
