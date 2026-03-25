import type { NaraRecord } from "@/types";

const BASE = "https://catalog.archives.gov/api/v2";

export async function searchNaraRecords(
  name: string,
  birthYear?: number | null,
  deathYear?: number | null
): Promise<NaraRecord[]> {
  if (!name || name.length < 3) return [];

  const params = new URLSearchParams({
    q: name,
    resultTypes: "item",
    rows: "5",
    offset: "0",
  });

  if (birthYear || deathYear) {
    const from = birthYear ?? (deathYear ? deathYear - 100 : undefined);
    const to = deathYear ?? (birthYear ? birthYear + 100 : undefined);
    if (from) params.set("dateRangeFrom", String(from));
    if (to) params.set("dateRangeTo", String(to));
  }

  try {
    const res = await fetch(`${BASE}/records?${params}`, {
      headers: { "x-api-key": "DEMO_KEY" }, // NARA allows DEMO_KEY for low-volume use
    });

    if (!res.ok) return [];

    const data = await res.json();
    const results = data.body?.hits?.hits ?? [];

    return results.slice(0, 5).map(
      (hit: {
        _source?: {
          record?: {
            title?: string;
            recordGroupNumber?: string;
            scopeAndContentNote?: string;
          };
          thumbnail?: { url?: string };
          naId?: string;
        };
      }) => {
        const src = hit._source?.record ?? {};
        return {
          title: src.title ?? "Untitled Record",
          recordGroup: src.recordGroupNumber ?? "",
          description: src.scopeAndContentNote ?? "",
          url: hit._source?.naId
            ? `https://catalog.archives.gov/id/${hit._source.naId}`
            : "https://catalog.archives.gov",
          thumbnailUrl: hit._source?.thumbnail?.url,
        };
      }
    );
  } catch {
    return [];
  }
}
