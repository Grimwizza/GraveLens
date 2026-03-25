import type { NaraRecord } from "@/types";

// NARA Catalog API v2
// DEMO_KEY: 40 req/hour per IP — sufficient for single-user PWA use.
// Military record groups most likely to contain service records:
//   RG 15  – Veterans Administration
//   RG 24  – Bureau of Naval Personnel
//   RG 94  – Adjutant General's Office (Army, pre-WWII)
//   RG 120 – American Expeditionary Forces (WWI)
//   RG 407 – Adjutant General's Office (WWII)
const BASE = "https://catalog.archives.gov/api/v2";
const API_KEY = "DEMO_KEY";

function mapHit(hit: Record<string, unknown>): NaraRecord | null {
  // NARA v2 Elasticsearch response: hit._source contains the record
  const src = (hit._source ?? {}) as Record<string, unknown>;
  const rec = (src.record ?? {}) as Record<string, unknown>;
  const naId = src.naId as string | undefined;

  // Some hits nest under description.item, others directly on record
  const desc = (src.description ?? {}) as Record<string, unknown>;
  const item = (desc.item ?? desc.series ?? desc.recordGroup ?? {}) as Record<string, unknown>;

  const title =
    (rec.title as string) ||
    (item.title as string) ||
    (src.title as string) ||
    "";

  if (!title) return null;

  return {
    title,
    recordGroup: (rec.recordGroupNumber as string) || (src.recordGroupNumber as string) || "",
    description:
      (rec.scopeAndContentNote as string) ||
      (item.scopeAndContentNote as string) ||
      (src.description as string) ||
      "",
    url: naId
      ? `https://catalog.archives.gov/id/${naId}`
      : "https://catalog.archives.gov",
    thumbnailUrl: ((src.thumbnail ?? {}) as Record<string, unknown>).url as string | undefined,
  };
}

export async function searchNaraRecords(
  name: string,
  birthYear?: number | null,
  deathYear?: number | null,
  militaryTerms?: string   // extra terms to bias toward military records
): Promise<NaraRecord[]> {
  if (!name || name.length < 3) return [];

  // Build a targeted query: name + any military keywords found on the marker
  const q = militaryTerms ? `"${name}" ${militaryTerms}` : name;

  const params = new URLSearchParams({
    q,
    resultTypes: "item",
    rows: "8",        // fetch more so we can filter noise
    offset: "0",
    apiKey: API_KEY,
  });

  // Constrain date range if we have years
  if (birthYear || deathYear) {
    const from = birthYear ?? (deathYear! - 90);
    const to   = deathYear ?? (birthYear! + 90);
    params.set("dateRangeFrom", String(from));
    params.set("dateRangeTo",   String(to));
  }

  try {
    const res = await fetch(`${BASE}/records?${params}`, {
      headers: {
        "Accept": "application/json",
        "x-api-key": API_KEY,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = await res.json();

    // NARA v2 wraps results in body.hits.hits (Elasticsearch format)
    const hits: Record<string, unknown>[] =
      (data?.body?.hits?.hits as Record<string, unknown>[]) ??
      (data?.hits?.hits       as Record<string, unknown>[]) ??
      [];

    return hits
      .map(mapHit)
      .filter((r): r is NaraRecord => r !== null)
      .slice(0, 5);
  } catch {
    return [];
  }
}
