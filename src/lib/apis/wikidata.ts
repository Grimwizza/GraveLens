// Option G: Wikidata SPARQL — notable local events within the person's lifespan.
// Finds items with a geo-coordinate within ~50 km of the grave that have a
// point-in-time (P585) date falling within birth–death years.
// Excludes NRHP heritage sites (covered separately by nrhp.ts).

import type { WikidataEvent } from "@/types";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

export async function getLocalWikidataEvents(
  lat: number,
  lng: number,
  birthYear: number | null,
  deathYear: number | null
): Promise<WikidataEvent[]> {
  if (!lat || !lng || !birthYear || !deathYear) return [];

  // WKT format: Point(longitude latitude)
  const point = `Point(${lng} ${lat})`;
  const radiusKm = 50;

  const query = `
SELECT DISTINCT ?item ?itemLabel ?date ?desc WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "${point}"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
  }
  ?item wdt:P585 ?date .
  FILTER(YEAR(?date) >= ${birthYear} && YEAR(?date) <= ${deathYear})
  FILTER NOT EXISTS { ?item wdt:P1435 wd:Q652150 }
  OPTIONAL { ?item schema:description ?desc FILTER(LANG(?desc) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
ORDER BY ?date
LIMIT 20`.trim();

  try {
    const res = await fetch(
      `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`,
      {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "GraveLens/1.0 (genealogy research app)",
        },
        signal: AbortSignal.timeout(12000),
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const bindings: Array<Record<string, { value: string }>> =
      data?.results?.bindings ?? [];

    return bindings
      .map((b) => {
        const label = b.itemLabel?.value ?? "";
        const wikidataId = b.item?.value?.split("/").pop() ?? "";

        // Skip if the label is just the Wikidata ID (no human-readable name)
        if (!label || label === wikidataId || /^Q\d+$/.test(label)) return null;

        const rawDate = b.date?.value ?? "";
        const year = rawDate ? new Date(rawDate).getFullYear() : 0;
        if (!year) return null;

        const evt: WikidataEvent = {
          label,
          year,
          description: b.desc?.value,
          wikidataId,
        };
        return evt;
      })
      .filter((e): e is WikidataEvent => e !== null);
  } catch {
    return [];
  }
}
