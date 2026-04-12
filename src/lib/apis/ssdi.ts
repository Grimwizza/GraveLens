/**
 * ssdi.ts
 * Social Security Death Index (SSDI) via FamilySearch Platform API.
 *
 * The SSDI is the single fastest identity-confirmation tool for American deaths
 * between 1936 and 2014. It is a public index — no authentication required.
 *
 * FamilySearch collection ID: 2437639
 * API docs: https://www.familysearch.org/developers/docs/api/
 *
 * What this returns per hit:
 *   - Confirmed death date (compare against OCR extraction)
 *   - Last known residence state (flag cross-state migration)
 *   - Birth date (cross-validate against gravestone birth date)
 *   - Deep link to the FamilySearch SSDI record page
 *
 * SSN is intentionally suppressed — FamilySearch redacts it for post-1936
 * deaths under 10 years old; older SSNs are irrelevant to display.
 */

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

const FS_SEARCH = "https://api.familysearch.org/platform/records/search";
const SSDI_COLLECTION = "2437639";

const FS_HEADERS = { Accept: "application/x-gedcomx-atom+json" };

// GedcomX type URIs used in SSDI records
const TYPE_BIRTH = "http://gedcomx.org/Birth";
const TYPE_DEATH = "http://gedcomx.org/Death";
const TYPE_RESIDENCE = "http://gedcomx.org/Residence";

interface GxFact {
  type?: string;
  date?: { original?: string; normalized?: Array<{ value?: string }> };
  place?: { original?: string; normalized?: Array<{ description?: string; value?: string }> };
}

interface GxPerson {
  names?: Array<{
    nameForms?: Array<{
      fullText?: string;
      parts?: Array<{ type?: string; value?: string }>;
    }>;
  }>;
  facts?: GxFact[];
}

interface FsEntry {
  title?: string;
  links?: Record<string, { href?: string }>;
  content?: { gedcomx?: { persons?: GxPerson[] } };
}

function extractDate(facts: GxFact[], type: string): string | undefined {
  const f = facts.find((x) => x.type === type);
  if (!f?.date) return undefined;
  return f.date.normalized?.[0]?.value ?? f.date.original;
}

function extractStateFromPlace(placeStr: string | undefined): string | undefined {
  if (!placeStr) return undefined;
  // Common formats: "City, County, State, USA" or "State, United States"
  const parts = placeStr.split(",").map((p) => p.trim());
  // Last non-"United States"/"USA" part is often the state
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (!p || p === "United States" || p === "USA" || p === "US") continue;
    return p;
  }
  return undefined;
}

function extractResidenceState(facts: GxFact[]): string | undefined {
  // Try explicit Residence fact first, then Death place as proxy for last residence
  for (const type of [TYPE_RESIDENCE, TYPE_DEATH]) {
    const f = facts.find((x) => x.type === type);
    const place = f?.place?.normalized?.[0]?.value ?? f?.place?.original;
    const state = extractStateFromPlace(place);
    if (state) return state;
  }
  return undefined;
}

function extractFullName(person: GxPerson): string {
  const form = person.names?.[0]?.nameForms?.[0];
  if (form?.fullText) return form.fullText;
  const parts = form?.parts ?? [];
  return parts.map((p) => p.value ?? "").filter(Boolean).join(" ");
}

/**
 * Scores how well the SSDI record matches the expected person.
 * Returned confidence is used in the UI badge.
 */
function scoreMatch(
  record: { birthDate?: string; deathDate?: string },
  expectedBirthYear: number | null,
  expectedDeathYear: number | null
): "high" | "medium" | "low" {
  let score = 0;

  if (expectedBirthYear && record.birthDate) {
    const y = parseInt(record.birthDate.match(/\d{4}/)?.[0] ?? "0", 10);
    if (y && Math.abs(y - expectedBirthYear) <= 1) score += 2;
    else if (y && Math.abs(y - expectedBirthYear) <= 3) score += 1;
  }

  if (expectedDeathYear && record.deathDate) {
    const y = parseInt(record.deathDate.match(/\d{4}/)?.[0] ?? "0", 10);
    if (y && Math.abs(y - expectedDeathYear) <= 1) score += 2;
    else if (y && Math.abs(y - expectedDeathYear) <= 3) score += 1;
  }

  return score >= 3 ? "high" : score >= 1 ? "medium" : "low";
}

export async function searchSSdI(
  firstName: string,
  lastName: string,
  birthYear: number | null,
  deathYear: number | null
): Promise<SSDIRecord[]> {
  // SSDI only covers 1936–2014
  if (!deathYear || deathYear < 1936 || deathYear > 2014) return [];
  if (!lastName || lastName.length < 2) return [];

  const params = new URLSearchParams({
    "q.givenName": firstName ?? "",
    "q.surname": lastName,
    "f.collectionId": SSDI_COLLECTION,
    count: "5",
  });

  if (deathYear) {
    params.set("q.deathLikeDate.from", String(deathYear - 1));
    params.set("q.deathLikeDate.to", String(deathYear + 1));
  }
  if (birthYear) {
    params.set("q.birthLikeDate.from", String(birthYear - 2));
    params.set("q.birthLikeDate.to", String(birthYear + 2));
  }

  try {
    const res = await fetch(`${FS_SEARCH}?${params}`, {
      headers: FS_HEADERS,
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];

    const data = await res.json();
    const entries: FsEntry[] = data?.entries ?? [];

    const results: SSDIRecord[] = [];

    for (const entry of entries) {
      if (results.length >= 3) break; // Return top 3 matches at most

      const person = entry.content?.gedcomx?.persons?.[0];
      if (!person) continue;

      const facts = person.facts ?? [];
      const name = extractFullName(person) || entry.title?.trim() || "";
      if (!name) continue;

      const birthDate = extractDate(facts, TYPE_BIRTH);
      const deathDate = extractDate(facts, TYPE_DEATH);
      const lastResidenceState = extractResidenceState(facts);

      const url =
        entry.links?.["person"]?.href ??
        entry.links?.["self"]?.href ??
        `https://www.familysearch.org/search/record/results?q.surname=${encodeURIComponent(lastName)}&f.collectionId=${SSDI_COLLECTION}`;

      const matchConfidence = scoreMatch({ birthDate, deathDate }, birthYear, deathYear);

      results.push({
        name,
        birthDate,
        deathDate,
        lastResidenceState,
        matchConfidence,
        url,
      });
    }

    return results;
  } catch {
    return [];
  }
}
