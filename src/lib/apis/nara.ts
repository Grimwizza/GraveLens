import type { NaraRecord } from "@/types";

// NARA Catalog API v2 — Elasticsearch-backed catalog of holdings.
// DEMO_KEY: 40 req/hour per IP — sufficient for single-user PWA use.
//
// NOTE: The NARA catalog indexes finding aids and record SERIES, not individual
// people. Results are most useful for military records because NARA describes
// series by conflict/unit (e.g. "WWII Enlistment Records 1938–1946"). Name
// searches occasionally surface named collections or pension files.
//
// Record groups most likely to yield results:
//   RG 15  – Veterans Administration pension files
//   RG 24  – Bureau of Naval Personnel
//   RG 94  – Adjutant General's Office (Army, pre-WWII)
//   RG 120 – American Expeditionary Forces (WWI)
//   RG 407 – Adjutant General's Office (WWII)

const BASE = "https://catalog.archives.gov/api/v2";
const API_KEY = "DEMO_KEY";

interface NaraHit {
  _id?: string;
  _score?: number;
  _source?: Record<string, unknown>;
  [key: string]: unknown;
}

type UnknownRecord = Record<string, unknown>;

function extractTitle(src: UnknownRecord): string {
  const rec = (src.record ?? {}) as UnknownRecord;
  const desc = (src.description ?? {}) as UnknownRecord;
  const item = (desc.item ?? desc.series ?? desc.recordGroup ?? desc.fileUnit ?? {}) as UnknownRecord;
  return (
    (src.title as string) ||
    (rec.title as string) ||
    (item.title as string) ||
    ""
  );
}

function extractDescription(src: UnknownRecord): string {
  const rec = (src.record ?? {}) as UnknownRecord;
  const desc = (src.description ?? {}) as UnknownRecord;
  const item = (desc.item ?? desc.series ?? {}) as UnknownRecord;
  return (
    (rec.scopeAndContentNote as string) ||
    (item.scopeAndContentNote as string) ||
    (src.scopeAndContentNote as string) ||
    (item.description as string) ||
    ""
  );
}

function mapHit(hit: NaraHit): NaraRecord | null {
  const src = (hit._source ?? {}) as Record<string, unknown>;
  const naId = (src.naId as string | number | undefined)?.toString();

  const title = extractTitle(src);
  if (!title) return null;

  const recordGroupNumber =
    (src.recordGroupNumber as string) ||
    ((src.record as Record<string, unknown>)?.recordGroupNumber as string) ||
    "";

  return {
    title,
    recordGroup: recordGroupNumber,
    description: extractDescription(src),
    url: naId
      ? `https://catalog.archives.gov/id/${naId}`
      : "https://catalog.archives.gov",
    thumbnailUrl: ((src.thumbnail ?? {}) as Record<string, unknown>).url as
      | string
      | undefined,
  };
}

function hitsFromResponse(data: unknown): NaraHit[] {
  if (!data || typeof data !== "object") return [];
  const d = data as UnknownRecord;
  // NARA v2 wraps ES response in a "body" key in some versions, bare in others
  const body = d.body as UnknownRecord | undefined;
  const bodyHits = body?.hits as UnknownRecord | undefined;
  const topHits = d.hits as UnknownRecord | undefined;
  return (
    (bodyHits?.hits as NaraHit[]) ||
    (topHits?.hits as NaraHit[]) ||
    (d.results as NaraHit[]) ||
    []
  );
}

export async function searchNaraRecords(
  name: string,
  birthYear?: number | null,
  deathYear?: number | null,
  militaryTerms?: string
): Promise<NaraRecord[]> {
  if (!name || name.length < 3) return [];

  // Full quoted name + any military keywords found on the marker
  const namePart = `"${name}"`;
  const q = militaryTerms ? `${namePart} ${militaryTerms}` : namePart;

  const params = new URLSearchParams({
    q,
    resultTypes: "item",
    rows: "8",
    offset: "0",
    apiKey: API_KEY,
  });

  if (birthYear || deathYear) {
    const from = birthYear ?? (deathYear! - 90);
    const to   = deathYear ?? (birthYear! + 90);
    params.set("dateRangeFrom", String(from));
    params.set("dateRangeTo",   String(to));
  }

  // Try the /records sub-path first (v2 documented path), fall back to base URL
  const urls = [
    `${BASE}/records?${params}`,
    `${BASE}?${params}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "x-api-key": API_KEY,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const hits = hitsFromResponse(data);
      if (hits.length === 0) continue;

      return hits
        .map(mapHit)
        .filter((r): r is NaraRecord => r !== null)
        .slice(0, 5);
    } catch {
      continue;
    }
  }

  return [];
}
