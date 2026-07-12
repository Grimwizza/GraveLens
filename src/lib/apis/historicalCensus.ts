/**
 * historicalCensus.ts — Historical U.S. Census search (1880–1940).
 *
 * ⚠️ SOURCE UNAVAILABLE (verified July 2026): this rode on the FamilySearch
 * Platform records-search API, which 404s without OAuth partner access.
 * See familysearch.ts for the full explanation.
 *
 * Returns status "unavailable" plus a deep link into the FamilySearch web
 * search scoped to the census year most relevant to the person's lifespan
 * (with residence-place pre-filled when the burial state is known).
 */

import { unavailableResult, type SourceResult } from "./client";
import { buildFamilySearchWebUrl } from "./familysearch";

export interface CensusHouseholdMember {
  name: string;
  relationship?: string;
  age?: string;
  birthplace?: string;
}

export interface HistoricalCensusRecord {
  /** The census year (1880, 1900, …, 1940) */
  year: number;
  /** Name as indexed in the census */
  name: string;
  /** State of residence at time of enumeration */
  state?: string;
  /** County of residence */
  county?: string;
  /** Occupation as recorded */
  occupation?: string;
  /** Birthplace of this person */
  birthplace?: string;
  /** Father's birthplace */
  fatherBirthplace?: string;
  /** Mother's birthplace */
  motherBirthplace?: string;
  /** Other household members parsed from the record */
  household?: CensusHouseholdMember[];
  /** Direct FamilySearch record link */
  url: string;
}

// Census year → FamilySearch collection ID (kept for fallback deep links).
// The 1890 census was destroyed by fire in 1921 — never indexed.
const CENSUS_COLLECTIONS: Array<{ year: number; id: string }> = [
  { year: 1940, id: "2000219" },
  { year: 1930, id: "1452222" },
  { year: 1920, id: "1488411" },
  { year: 1910, id: "1727033" },
  { year: 1900, id: "1325221" },
  { year: 1880, id: "1417683" },
];

/** The census year the person is most likely to appear in as an adult. */
function bestCensusYear(
  birthYear: number | null,
  deathYear: number | null
): { year: number; id: string } | undefined {
  return CENSUS_COLLECTIONS.find(({ year }) => {
    if (birthYear && year < birthYear + 1) return false; // not born yet
    if (deathYear && year > deathYear + 1) return false; // already dead
    return true;
  });
}

export async function searchHistoricalCensus(
  firstName: string,
  lastName: string,
  birthYear: number | null,
  deathYear: number | null,
  state?: string
): Promise<SourceResult<HistoricalCensusRecord>> {
  if (!lastName || lastName.length < 2) return { status: "empty", records: [] };
  if (deathYear && deathYear > 1950) return { status: "empty", records: [] };

  const target = bestCensusYear(birthYear, deathYear);
  if (!target) return { status: "empty", records: [] };

  return unavailableResult(
    buildFamilySearchWebUrl({
      firstName,
      lastName,
      birthYear,
      collectionId: target.id,
      residencePlace: state,
    })
  );
}
