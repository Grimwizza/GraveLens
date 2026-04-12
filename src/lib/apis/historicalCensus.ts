/**
 * historicalCensus.ts
 * Historical U.S. Census search via FamilySearch Platform API.
 *
 * Coverage: 1880, 1900, 1910, 1920, 1930, 1940 — the "golden age" of
 * enumeration. Each indexed census provides household composition, occupation,
 * birthplace, and parents' birthplaces — often the single richest data source
 * for genealogical research.
 *
 * The 1890 census was almost entirely destroyed by fire in 1921 — not indexed.
 * The 1950 census was fully released in April 2022 and is being indexed.
 *
 * Strategy:
 *   - Pick the 2 census years most relevant to the person's birth year
 *     (they should be alive and old enough to appear as an independent person
 *     or as a household member)
 *   - Search FamilySearch unauthenticated public search for each
 *   - Extract: name, year, household members, occupation, birthplace, state
 *
 * FamilySearch collection IDs:
 *   1880 → 1417683    1900 → 1325221    1910 → 1727033
 *   1920 → 1488411    1930 → 1452222    1940 → 2000219
 */

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

// ── Census collection registry ────────────────────────────────────────────────

const CENSUS_COLLECTIONS: Array<{
  year: number;
  id: string;
}> = [
  { year: 1940, id: "2000219" },
  { year: 1930, id: "1452222" },
  { year: 1920, id: "1488411" },
  { year: 1910, id: "1727033" },
  { year: 1900, id: "1325221" },
  { year: 1880, id: "1417683" },
];

const FS_SEARCH = "https://api.familysearch.org/platform/records/search";
const FS_HEADERS = { Accept: "application/x-gedcomx-atom+json" };

// GedcomX URIs
const TYPE_BIRTH     = "http://gedcomx.org/Birth";
const TYPE_RESIDENCE = "http://gedcomx.org/Residence";
const TYPE_OCCUPATION = "http://gedcomx.org/Occupation";

interface GxFact {
  type?: string;
  date?: { original?: string };
  place?: { original?: string; normalized?: Array<{ value?: string }> };
  value?: string;
}

interface GxName {
  nameForms?: Array<{
    fullText?: string;
    parts?: Array<{ type?: string; value?: string }>;
  }>;
}

interface GxRelationship {
  type?: string;
  person1?: { resourceId?: string };
  person2?: { resourceId?: string };
}

interface GxPerson {
  id?: string;
  extracted?: boolean;
  names?: GxName[];
  facts?: GxFact[];
  fields?: Array<{ type?: string; values?: Array<{ text?: string }> }>;
}

interface FsEntry {
  title?: string;
  links?: Record<string, { href?: string }>;
  content?: {
    gedcomx?: {
      persons?: GxPerson[];
      relationships?: GxRelationship[];
    };
  };
}

function getFullName(person: GxPerson): string {
  return person.names?.[0]?.nameForms?.[0]?.fullText ?? "";
}

function getPlace(facts: GxFact[], ...types: string[]): string | undefined {
  for (const type of types) {
    const f = facts.find((x) => x.type === type);
    if (f?.place) return f.place.normalized?.[0]?.value ?? f.place.original;
  }
  return undefined;
}

function getOccupation(facts: GxFact[]): string | undefined {
  const f = facts.find((x) => x.type === TYPE_OCCUPATION);
  return f?.value ?? f?.place?.original;
}

function extractStateCounty(place: string | undefined): { state?: string; county?: string } {
  if (!place) return {};
  const parts = place.split(",").map((s) => s.trim()).filter(Boolean);
  // "Town, County, State, US" or "County, State, US"
  if (parts.length >= 3) {
    return { state: parts[parts.length - 2] || undefined, county: parts[parts.length - 3] || undefined };
  }
  if (parts.length === 2) {
    return { state: parts[1] || undefined };
  }
  return { state: parts[0] || undefined };
}

/**
 * Pick the 2 census years most useful for this person:
 * - They should be at least 5 years old (to appear as child) or ideally 18+
 * - They should be alive (census year < deathYear + 3)
 */
function selectCensusYears(
  birthYear: number | null,
  deathYear: number | null
): Array<{ year: number; id: string }> {
  return CENSUS_COLLECTIONS.filter(({ year }) => {
    if (birthYear && year < birthYear + 1) return false;   // Person not born yet
    if (deathYear && year > deathYear + 1) return false;   // Person already dead
    return true;
  }).slice(0, 2);
}

/**
 * Search FamilySearch historical census collections for a person.
 * Returns up to 4 total records across the 2 most relevant census years.
 */
export async function searchHistoricalCensus(
  firstName: string,
  lastName: string,
  birthYear: number | null,
  deathYear: number | null,
  state?: string
): Promise<HistoricalCensusRecord[]> {
  if (!lastName || lastName.length < 2) return [];
  // Only useful for pre-1941 deaths
  if (deathYear && deathYear > 1943) return [];

  const years = selectCensusYears(birthYear, deathYear);
  if (years.length === 0) return [];

  const allRecords: HistoricalCensusRecord[] = [];

  const searches = years.map(async ({ year, id }) => {
    const params = new URLSearchParams({
      "q.givenName": firstName ?? "",
      "q.surname": lastName,
      "f.collectionId": id,
      count: "3",
    });
    if (state) params.set("q.residencePlace", state);
    if (birthYear) {
      params.set("q.birthLikeDate.from", String(birthYear - 3));
      params.set("q.birthLikeDate.to",   String(birthYear + 3));
    }

    try {
      const res = await fetch(`${FS_SEARCH}?${params}`, {
        headers: FS_HEADERS,
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) return;

      const data = await res.json();
      const entries: FsEntry[] = data?.entries ?? [];

      for (const entry of entries) {
        if (allRecords.length >= 4) return;

        const persons = entry.content?.gedcomx?.persons ?? [];
        // The "extracted" person is the subject of the record
        const subject = persons.find((p) => p.extracted !== false && p.extracted !== undefined)
          ?? persons[0];
        if (!subject) continue;

        const facts = subject.facts ?? [];
        const name = getFullName(subject) || entry.title?.trim() || "";
        if (!name) continue;

        const residencePlace = getPlace(facts, TYPE_RESIDENCE, TYPE_BIRTH);
        const { state: resState, county: resCounty } = extractStateCounty(residencePlace);

        const birthplace = getPlace(facts, TYPE_BIRTH);
        const occupation = getOccupation(facts);

        // Extract other household members (persons in the same GedcomX payload
        // who are NOT the subject)
        const household: CensusHouseholdMember[] = persons
          .filter((p) => p.id !== subject.id)
          .slice(0, 5)
          .map((p) => {
            const pf = p.facts ?? [];
            const pBirth = pf.find((x) => x.type === TYPE_BIRTH);
            const relationship = entry.content?.gedcomx?.relationships?.find(
              (r) => r.person1?.resourceId === subject.id && r.person2?.resourceId === p.id
              || r.person2?.resourceId === subject.id && r.person1?.resourceId === p.id
            )?.type?.split("/").pop();

            return {
              name: getFullName(p) || "Unknown",
              relationship,
              birthplace: getPlace(pf, TYPE_BIRTH),
              age: pBirth?.date?.original,
            };
          })
          .filter((m) => m.name !== "Unknown");

        const url =
          entry.links?.["person"]?.href ??
          entry.links?.["self"]?.href ??
          `https://www.familysearch.org/search/record/results?q.surname=${encodeURIComponent(lastName)}&f.collectionId=${id}`;

        allRecords.push({
          year,
          name,
          state: resState,
          county: resCounty,
          occupation,
          birthplace,
          household: household.length > 0 ? household : undefined,
          url,
        });
      }
    } catch {
      // Non-fatal
    }
  });

  await Promise.allSettled(searches);

  // Sort by census year descending (most recent is most informative)
  return allRecords.sort((a, b) => b.year - a.year);
}
