/**
 * immigration.ts — Immigration & passenger record search.
 *
 * ⚠️ SOURCE UNAVAILABLE (verified July 2026): this rode on the FamilySearch
 * Platform records-search API, which 404s without OAuth partner access.
 * See familysearch.ts for the full explanation.
 *
 * Returns status "unavailable" plus a deep link into the FamilySearch web
 * search scoped to the most era-relevant immigration collection.
 *
 * The isLikelyImmigrant() heuristic remains fully functional — it gates the
 * research checklist and decides whether the fallback link is offered.
 */

import { unavailableResult, type SourceResult } from "./client";
import { buildFamilySearchWebUrl } from "./familysearch";

export interface ImmigrationRecord {
  /** Source collection label, e.g. "Ellis Island Arrivals" */
  collection: string;
  /** Full name as recorded at arrival */
  name: string;
  /** Year of arrival */
  arrivalYear?: string;
  /** Full arrival date if available */
  arrivalDate?: string;
  /** Port of departure (European city) */
  departurePort?: string;
  /** Port of arrival in USA */
  arrivalPort?: string;
  /** Age at arrival */
  ageAtArrival?: string;
  /** Origin town, county or country */
  origin?: string;
  /** Deep link to the record on FamilySearch */
  url: string;
}

// FamilySearch collection IDs, kept for fallback deep links
const COLLECTIONS: Array<{
  id: string;
  label: string;
  yearFrom: number;
  yearTo: number;
}> = [
  { id: "1849782", label: "US Passenger and Immigration Lists",     yearFrom: 1538, yearTo: 1940 },
  { id: "1923067", label: "Ellis Island Arrivals",                  yearFrom: 1892, yearTo: 1957 },
  { id: "1854451", label: "Castle Garden Arrivals",                 yearFrom: 1820, yearTo: 1892 },
  { id: "1840847", label: "German Immigrants to the United States", yearFrom: 1850, yearTo: 1897 },
  { id: "2431653", label: "US Naturalization Records",              yearFrom: 1790, yearTo: 1990 },
];

function birthToArrivalWindow(birthYear: number): { from: number; to: number } {
  // Most immigrants arrived between ages 15 and 45
  return { from: birthYear + 10, to: birthYear + 55 };
}

export async function searchImmigrationRecords(
  firstName: string,
  lastName: string,
  birthYear: number | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature kept stable for call sites; used again when inline search returns
  _deathYear: number | null
): Promise<SourceResult<ImmigrationRecord>> {
  if (!lastName || lastName.length < 2) return { status: "empty", records: [] };

  // Pick the most era-relevant collection for the fallback link
  const window = birthYear ? birthToArrivalWindow(birthYear) : null;
  const relevant = COLLECTIONS.find((c) => {
    if (!window) return true;
    return c.yearFrom <= window.to && c.yearTo >= window.from;
  });

  return unavailableResult(
    buildFamilySearchWebUrl({
      firstName,
      lastName,
      birthYear,
      collectionId: relevant?.id,
    })
  );
}

// ── Heuristic: should we search immigration records? ─────────────────────────

/**
 * Returns true when the available data suggests this person was born
 * outside the US or arrived as an immigrant. Shared between the lookup
 * route and the research checklist engine.
 */
export function isLikelyImmigrant(
  inscription: string,
  denomination: string | undefined,
  birthYear: number | null,
  country: string | undefined
): boolean {
  // Non-English diacritics in inscription
  if (/[àáâãäåæèéêëìíîïòóôõöùúûüýÿñçßøœ]/i.test(inscription)) return true;
  // Religious community associated with immigrant groups
  if (/lutheran|catholic|jewish|orthodox|evangelical|methodist|mennonite|moravian/i.test(denomination ?? "")) return true;
  // Burial is outside US
  if (country && country !== "United States" && country !== "US" && country !== "USA") return true;
  return false;
}
