import type { NaraRecord, NaraItemRecord } from "@/types";

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

// ── F6: Item-level military record search ─────────────────────────────────────

const FS_SEARCH = "https://api.familysearch.org/platform/records/search";
const FS_HEADERS = { Accept: "application/x-gedcomx-atom+json" };
const CIVIL_WAR_PENSION_COLLECTION = "1932460";

interface FsEntry {
  title?: string;
  links?: Record<string, { href?: string }>;
}

async function searchCivilWarPension(
  firstName: string,
  lastName: string,
  birthYear: number | null,
): Promise<NaraItemRecord[]> {
  const params = new URLSearchParams({
    "q.givenName": firstName ?? "",
    "q.surname": lastName,
    "f.collectionId": CIVIL_WAR_PENSION_COLLECTION,
    count: "4",
  });
  if (birthYear) {
    params.set("q.birthLikeDate.from", String(birthYear - 5));
    params.set("q.birthLikeDate.to", String(birthYear + 5));
  }
  try {
    const res = await fetch(`${FS_SEARCH}?${params}`, {
      headers: FS_HEADERS,
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const entries: FsEntry[] = data?.entries ?? [];
    return entries.slice(0, 3).map((entry) => ({
      title: entry.title?.trim() || `Civil War Pension — ${firstName} ${lastName}`,
      recordGroup: "RG 15",
      description:
        "Civil War pension application — service history, wounds/disabilities, marriage, and family details.",
      url:
        entry.links?.["person"]?.href ??
        entry.links?.["self"]?.href ??
        `https://www.familysearch.org/search/record/results?f.collectionId=${CIVIL_WAR_PENSION_COLLECTION}&q.surname=${encodeURIComponent(lastName)}`,
    }));
  } catch {
    return [];
  }
}

/**
 * Returns item-level military records for the given conflict.
 * Civil War → FamilySearch Pension Index (real query).
 * WWII → NARA AAD deep-link search.
 * Vietnam → VVMF Wall database deep-link.
 */
export async function searchEnlistmentRecords(
  firstName: string,
  lastName: string,
  birthYear: number | null,
  conflict: string,
): Promise<NaraItemRecord[]> {
  if (!lastName || lastName.length < 2 || !conflict) return [];

  if (conflict === "Civil War") {
    return searchCivilWarPension(firstName, lastName, birthYear);
  }

  if (conflict === "World War II") {
    const aadUrl =
      `https://aad.archives.gov/aad/fielded-search.jsp?dt=893` +
      `&q_2415=${encodeURIComponent(lastName)}` +
      `&q_2416=${encodeURIComponent(firstName ?? "")}` +
      (birthYear ? `&q_2418=${birthYear}` : "") +
      `&buttonsub=Search`;
    return [
      {
        title: `WWII Army Enlistment Records — ${firstName} ${lastName}`,
        recordGroup: "RG 407",
        description:
          "9 million WWII Army enlistment records with rank, civilian occupation, education level, and birthplace.",
        url: aadUrl,
      },
    ];
  }

  if (conflict === "Vietnam War") {
    return [
      {
        title: `Vietnam Veterans Memorial Wall — ${firstName} ${lastName}`,
        recordGroup: "VVMF",
        description:
          "Vietnam Veterans Memorial Fund database — confirms KIA/MIA status, panel/line number, and unit assignment.",
        url: `https://www.vvmf.org/database/?name=${encodeURIComponent(lastName + ", " + firstName)}`,
      },
    ];
  }

  if (conflict === "World War I") {
    return [
      {
        title: `WWI Draft Registration Cards — ${firstName} ${lastName}`,
        recordGroup: "RG 163",
        description:
          "WWI draft registration cards (1917–1918) — birthplace, occupation, employer, and physical description.",
        url: `https://www.familysearch.org/search/record/results?q.surname=${encodeURIComponent(lastName)}&q.givenName=${encodeURIComponent(firstName ?? "")}&f.collectionId=1968530`,
      },
    ];
  }

  return [];
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
