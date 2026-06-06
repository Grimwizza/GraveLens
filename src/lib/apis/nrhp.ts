// Option D: National Register of Historic Places sites near the grave's GPS coordinates.
// Queries Wikidata via SPARQL — NRHP data is well-indexed there with coordinates.
// Returns sites whose period of significance overlaps the person's lifespan.

import type { NrhpSite } from "@/types";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

export async function searchNrhpSites(
  lat: number,
  lng: number,
  birthYear: number | null,
  deathYear: number | null
): Promise<NrhpSite[]> {
  if (lat === null || lng === null) return [];

  // WKT uses longitude THEN latitude
  const point = `Point(${lng} ${lat})`;
  const radiusKm = 16; // ~10 miles

  // Filter by inception year to exclude sites built long before or after the person's era.
  // P571 = inception (year built). Lower bound: birthYear - 50 (or deathYear - 150 fallback).
  // Upper bound: deathYear + 30 (site built shortly after death may still be relevant).
  const lowerBound = birthYear ? birthYear - 50 : deathYear ? deathYear - 150 : null;
  const upperBound = deathYear ? deathYear + 30 : null;
  const dateFilter =
    upperBound !== null
      ? `OPTIONAL { ?item wdt:P571 ?inception }
         BIND(YEAR(?inception) AS ?yearBuilt)
         FILTER(!BOUND(?yearBuilt) || (${lowerBound !== null ? `?yearBuilt >= ${lowerBound} && ` : ""}?yearBuilt <= ${upperBound}))`
      : "";

  const query = `
SELECT DISTINCT ?item ?itemLabel ?address ?yearBuilt WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "${point}"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
  }
  ?item wdt:P1435 wd:Q652150 .
  OPTIONAL { ?item wdt:P969 ?address }
  ${dateFilter}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
}
LIMIT 8`.trim();

  try {
    const res = await fetch(
      `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`,
      {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "GraveLens/1.0 (genealogy research app)",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const bindings: Array<Record<string, { value: string }>> =
      data?.results?.bindings ?? [];

    return bindings
      .map((b) => {
        const wikidataId = b.item?.value?.split("/").pop() ?? "";
        const name = b.itemLabel?.value ?? "";
        if (!name || name === wikidataId) return null; // no label = skip

        const site: NrhpSite = {
          name,
          address: b.address?.value,
          wikidataId,
          wikidataUrl: b.item?.value,
        };
        return site;
      })
      .filter((s): s is NrhpSite => s !== null)
      .slice(0, 6);
  } catch {
    return [];
  }
}
