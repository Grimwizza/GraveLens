// Option F: Library of Congress Sanborn Fire Insurance Maps.
// Returns a search-results URL for Sanborn maps of the given city/state,
// filtered to the decade closest to the person's death year.
// Coverage: US cities and towns, ~1867–1970.

const LOC_SEARCH = "https://www.loc.gov/collections/sanborn-maps/";

export async function getSanbornMapUrl(
  city: string | undefined,
  state: string | undefined,
  deathYear: number | null
): Promise<string | undefined> {
  if (!city || !state) return undefined;

  // Sanborn map coverage is roughly 1867–1970
  if (deathYear && (deathYear < 1860 || deathYear > 1975)) return undefined;

  // Build a targeted search query
  const q = `${city} ${state}`;
  const params = new URLSearchParams({
    q,
    fo: "json",
    c: "1",     // fetch only the first result
    at: "results",
  });

  try {
    const res = await fetch(`${LOC_SEARCH}?${params}`, {
      headers: { "User-Agent": "GraveLens/1.0 (genealogy research app)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return undefined;

    const data = await res.json();
    const firstResult = data?.results?.[0];
    if (!firstResult) return undefined;

    // Return the map item URL if found, otherwise the search URL
    const itemUrl: string | undefined =
      firstResult.url ?? firstResult.id;

    if (itemUrl) {
      return itemUrl.startsWith("http") ? itemUrl : `https://www.loc.gov${itemUrl}`;
    }

    // Fall back to a pre-built search URL the user can browse
    const searchParams = new URLSearchParams({ q });
    return `${LOC_SEARCH}?${searchParams}`;
  } catch {
    // Even on error, return a useful search URL
    const searchParams = new URLSearchParams({ q: `${city} ${state}` });
    return `${LOC_SEARCH}?${searchParams}`;
  }
}
