import { fetchSourceJson } from "./client";

const BASE_URL = "https://www.loc.gov/collections/sanborn-maps/";

export interface SanbornMapResult {
  title: string;
  url: string;
  thumbnailUrl?: string;
}

/**
 * Searches the Library of Congress for Sanborn Fire Insurance maps
 * matching the given city, state, and relevant year/decade.
 */
export async function searchSanbornMap(
  city: string | undefined,
  state: string | undefined,
  year: number | null
): Promise<SanbornMapResult | null> {
  if (!city || !state) return null;

  const targetYear = year ?? 1900;
  const decade = Math.floor(targetYear / 10) * 10;
  const query = `"${city}" "${state}" "${decade}s"`;

  const params = new URLSearchParams({
    q: query,
    fo: "json",
    c: "1",
    at: "results",
  });

  const outcome = await fetchSourceJson<any>(`${BASE_URL}?${params}`, {
    source: "loc-sanborn",
    timeoutMs: 8000,
  });

  if (!outcome.ok) return null;

  const firstResult = outcome.data?.results?.[0];
  if (!firstResult) return null;

  return {
    title: firstResult.title ?? `Sanborn Map — ${city}, ${state} (${decade}s)`,
    url: firstResult.url ?? `https://www.loc.gov/collections/sanborn-maps/?q=${encodeURIComponent(query)}`,
    thumbnailUrl: firstResult.image_url?.[0] ?? undefined,
  };
}
