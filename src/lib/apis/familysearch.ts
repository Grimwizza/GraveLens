/**
 * familysearch.ts
 * FamilySearch Platform API — free, unauthenticated public record search.
 *
 * What this does:
 *   1. searchFamilySearchHints() — searches the public record index for up to
 *      5 collection "hints" matching the person's name + dates. Returns the
 *      collection name, record type, date coverage, and a deep link. No tree
 *      data is accessed; this stays within the free unauthenticated tier.
 *
 * Rate limits: FamilySearch throttles unauthenticated requests at ~80/minute
 * per IP. The lookup route fires this once per scan — well within limits.
 *
 * API reference: https://www.familysearch.org/developers/docs/api/
 */

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

const FS_SEARCH = "https://api.familysearch.org/platform/records/search";

// FamilySearch GedcomX atom JSON content type
const FS_HEADERS = {
  Accept: "application/x-gedcomx-atom+json",
};

interface FsEntry {
  title?: string;
  links?: Record<string, { href?: string }>;
  content?: {
    gedcomx?: {
      persons?: Array<{
        extracted?: boolean;
        facts?: Array<{
          type?: string;
          date?: { original?: string; normalized?: Array<{ value?: string }> };
        }>;
      }>;
      sourceDescriptions?: Array<{
        titles?: Array<{ value?: string }>;
        coverage?: Array<{
          temporal?: { original?: string; normalized?: Array<{ value?: string }> };
        }>;
        types?: string[];
      }>;
    };
  };
}

function extractDateRange(entry: FsEntry): string | undefined {
  const sd = entry.content?.gedcomx?.sourceDescriptions?.[0];
  const temporal = sd?.coverage?.[0]?.temporal;
  if (!temporal) return undefined;
  return temporal.normalized?.[0]?.value ?? temporal.original;
}

function extractRecordType(entry: FsEntry): string | undefined {
  const sd = entry.content?.gedcomx?.sourceDescriptions?.[0];
  const types = sd?.types;
  if (!types?.length) return undefined;
  // FamilySearch uses URIs like "http://gedcomx.org/Death"
  const last = types[0].split("/").pop() ?? "";
  return last || undefined;
}

function extractUrl(entry: FsEntry): string {
  // Prefer the "person" link (record page), fall back to self
  const links = entry.links ?? {};
  return (
    links["person"]?.href ??
    links["self"]?.href ??
    links["alternate"]?.href ??
    "https://www.familysearch.org/search/record/results"
  );
}

/**
 * Checks whether a date range string broadly overlaps the person's lifespan.
 * e.g. "1880–1940" overlaps birthYear=1862, deathYear=1920 → true
 */
function dateRangeOverlaps(
  range: string | undefined,
  birthYear: number | null,
  deathYear: number | null
): boolean {
  if (!range) return true; // Unknown range — assume plausible
  const years = range.match(/\d{4}/g);
  if (!years || years.length === 0) return true;
  const rangeStart = parseInt(years[0], 10);
  const rangeEnd = parseInt(years[years.length - 1], 10);
  const personStart = birthYear ? birthYear - 5 : 1700;
  const personEnd = deathYear ? deathYear + 5 : 2050;
  return rangeStart <= personEnd && rangeEnd >= personStart;
}

export async function searchFamilySearchHints(
  firstName: string,
  lastName: string,
  birthYear: number | null,
  deathYear: number | null
): Promise<FamilySearchHint[]> {
  if (!lastName || lastName.length < 2) return [];

  const params = new URLSearchParams();
  if (firstName) params.set("q.givenName", firstName);
  params.set("q.surname", lastName);
  if (birthYear) params.set("q.birthLikeDate.from", String(birthYear - 2));
  if (birthYear) params.set("q.birthLikeDate.to", String(birthYear + 2));
  if (deathYear) params.set("q.deathLikeDate.from", String(deathYear - 2));
  if (deathYear) params.set("q.deathLikeDate.to", String(deathYear + 2));
  params.set("count", "8");

  try {
    const res = await fetch(`${FS_SEARCH}?${params}`, {
      headers: FS_HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const entries: FsEntry[] = data?.entries ?? [];

    const seen = new Set<string>();
    const hints: FamilySearchHint[] = [];

    for (const entry of entries) {
      if (hints.length >= 5) break;

      const title = entry.title?.trim() ?? "";
      if (!title || seen.has(title)) continue;
      seen.add(title);

      const dateRange = extractDateRange(entry);
      const recordType = extractRecordType(entry);
      const url = extractUrl(entry);
      const dateConfident = dateRangeOverlaps(dateRange, birthYear, deathYear);

      hints.push({ title, dateRange, recordType, url, dateConfident });
    }

    return hints;
  } catch {
    return [];
  }
}
