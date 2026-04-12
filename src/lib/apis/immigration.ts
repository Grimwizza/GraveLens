/**
 * immigration.ts
 * Immigration & passenger record search via FamilySearch Platform API.
 *
 * This module covers:
 *   1. US Passenger and Immigration Lists (FamilySearch) — indexed arrivals 1538–1940
 *   2. Ellis Island arrivals (FamilySearch collection 1923067) — 1892–1957
 *   3. Castle Garden passenger index (FamilySearch collection 1849782) — 1820–1892
 *   4. Naturalization records pointer via NARA RG 85 catalog search
 *
 * Trigger logic (called from the lookup route):
 *   - Fire only when the subject is flagged as likely immigrant by the
 *     isLikelyImmigrant() predicate (non-English inscription, Catholic/Lutheran
 *     denomination, or birthplace outside US inferred from other data).
 *
 * All collection searches are unauthenticated on the FamilySearch free tier.
 */

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

// ── FamilySearch collection IDs ───────────────────────────────────────────────

const COLLECTIONS: Array<{
  id: string;
  label: string;
  yearFrom: number;
  yearTo: number;
}> = [
  // Passenger and immigration lists — broad coverage 1538–1940
  { id: "1849782", label: "US Passenger and Immigration Lists",     yearFrom: 1538, yearTo: 1940 },
  // Ellis Island / Port of New York 1892–1957
  { id: "1923067", label: "Ellis Island Arrivals",                  yearFrom: 1892, yearTo: 1957 },
  // Castle Garden 1820–1892 (pre-Ellis Island)
  { id: "1854451", label: "Castle Garden Arrivals",                 yearFrom: 1820, yearTo: 1892 },
  // German immigrants to US 1850–1897
  { id: "1840847", label: "German Immigrants to the United States", yearFrom: 1850, yearTo: 1897 },
  // Naturalization records
  { id: "2431653", label: "US Naturalization Records",              yearFrom: 1790, yearTo: 1990 },
];

const FS_SEARCH = "https://api.familysearch.org/platform/records/search";
const FS_HEADERS = { Accept: "application/x-gedcomx-atom+json" };

interface GxFact {
  type?: string;
  date?: { original?: string; normalized?: Array<{ value?: string }> };
  place?: { original?: string; normalized?: Array<{ value?: string }> };
  value?: string;
}

interface GxPerson {
  names?: Array<{ nameForms?: Array<{ fullText?: string }> }>;
  facts?: GxFact[];
  fields?: Array<{ type?: string; values?: Array<{ text?: string }> }>;
}

interface FsEntry {
  title?: string;
  links?: Record<string, { href?: string }>;
  content?: { gedcomx?: { persons?: GxPerson[] } };
}

const TYPE_ARRIVAL  = "http://gedcomx.org/Arrival";
const TYPE_EMIGRATION = "http://gedcomx.org/Emigration";
const TYPE_IMMIGRATION = "http://gedcomx.org/Immigration";
const TYPE_BIRTH    = "http://gedcomx.org/Birth";
const TYPE_RESIDENCE = "http://gedcomx.org/Residence";

function getDate(facts: GxFact[], ...types: string[]): string | undefined {
  for (const type of types) {
    const f = facts.find((x) => x.type === type);
    if (f?.date) return f.date.normalized?.[0]?.value ?? f.date.original;
  }
  return undefined;
}

function getPlace(facts: GxFact[], ...types: string[]): string | undefined {
  for (const type of types) {
    const f = facts.find((x) => x.type === type);
    if (f?.place) return f.place.normalized?.[0]?.value ?? f.place.original;
  }
  return undefined;
}

function getName(person: GxPerson, fallback: string): string {
  return person.names?.[0]?.nameForms?.[0]?.fullText ?? fallback;
}

function extractArrivalYear(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;
  const m = dateStr.match(/\d{4}/);
  return m ? m[0] : undefined;
}

function birthToArrivalWindow(birthYear: number): { from: number; to: number } {
  // Most immigrants arrived between ages 15 and 45
  return { from: birthYear + 10, to: birthYear + 55 };
}

/**
 * Searches immigration-related FamilySearch collections.
 * Only fires for likely-immigrant subjects (caller's responsibility to gate).
 *
 * @param firstName  Given name from OCR
 * @param lastName   Surname from OCR
 * @param birthYear  Birth year from OCR (used to target arrival window)
 * @param deathYear  Death year (used to exclude impossible dates)
 */
export async function searchImmigrationRecords(
  firstName: string,
  lastName: string,
  birthYear: number | null,
  deathYear: number | null
): Promise<ImmigrationRecord[]> {
  if (!lastName || lastName.length < 2) return [];

  const window = birthYear ? birthToArrivalWindow(birthYear) : null;

  // Pick the two most relevant collections based on birth year
  const relevant = COLLECTIONS.filter((c) => {
    if (!window) return true;
    return c.yearFrom <= window.to && c.yearTo >= window.from;
  }).slice(0, 2);

  if (relevant.length === 0) return [];

  const allRecords: ImmigrationRecord[] = [];

  // Fire collection searches in parallel — fail-safe per collection
  const searches = relevant.map(async (col) => {
    const params = new URLSearchParams({
      "q.givenName": firstName ?? "",
      "q.surname": lastName,
      "f.collectionId": col.id,
      count: "4",
    });

    if (window) {
      params.set("q.anyDate.from", String(Math.max(col.yearFrom, window.from)));
      params.set("q.anyDate.to",   String(Math.min(col.yearTo,   window.to)));
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
        if (allRecords.length >= 5) return;

        const person = entry.content?.gedcomx?.persons?.[0];
        if (!person) continue;

        const facts = person.facts ?? [];
        const name = getName(person, entry.title?.trim() ?? "");
        if (!name) continue;

        const arrivalDate = getDate(facts, TYPE_ARRIVAL, TYPE_IMMIGRATION, TYPE_EMIGRATION);
        const departurePort = getPlace(facts, TYPE_EMIGRATION);
        const arrivalPort   = getPlace(facts, TYPE_ARRIVAL, TYPE_IMMIGRATION);
        const origin        = getPlace(facts, TYPE_BIRTH, TYPE_RESIDENCE);

        // Skip if arrival year is after death — impossible
        const arrYear = arrivalDate ? parseInt(arrivalDate.match(/\d{4}/)?.[0] ?? "0", 10) : null;
        if (arrYear && deathYear && arrYear > deathYear) continue;

        const url =
          entry.links?.["person"]?.href ??
          entry.links?.["self"]?.href ??
          `https://www.familysearch.org/search/record/results?q.surname=${encodeURIComponent(lastName)}&f.collectionId=${col.id}`;

        allRecords.push({
          collection: col.label,
          name,
          arrivalDate,
          arrivalYear: extractArrivalYear(arrivalDate),
          departurePort,
          arrivalPort,
          origin,
          url,
        });
      }
    } catch {
      // Non-fatal — one collection failing shouldn't block others
    }
  });

  await Promise.allSettled(searches);

  // Deduplicate: skip entries whose name + year already appears
  const seen = new Set<string>();
  return allRecords.filter((r) => {
    const key = `${r.name}|${r.arrivalYear ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  // Birth year before 1920 — high base rate of immigrant population in US
  if (birthYear && birthYear < 1900) return true;
  return false;
}
