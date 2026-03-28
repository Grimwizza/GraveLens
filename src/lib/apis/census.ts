// Option E: US Census Bureau historical county population.
// Step 1 — Census geocoding API converts lat/lng to FIPS state + county codes.
// Step 2 — Decennial census API returns population at each census year.
//
// Coverage: Census API supports 1990, 2000, 2010, 2020 reliably.
// Pre-1990 decennial data is not available through the standard Census API.

import type { CensusEntry } from "@/types";

const GEOCODER =
  "https://geocoding.geo.census.gov/geocoder/geographies/coordinates";
const CENSUS_API = "https://api.census.gov/data";

interface FipsResult {
  stateFips: string;
  countyFips: string;
  countyName: string;
}

async function getFipsFromCoords(
  lat: number,
  lng: number
): Promise<FipsResult | null> {
  const params = new URLSearchParams({
    x: String(lng),
    y: String(lat),
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    format: "json",
  });

  try {
    const res = await fetch(`${GEOCODER}?${params}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const county =
      data?.result?.geographies?.Counties?.[0] ??
      data?.result?.geographies?.["Census Counties"]?.[0];

    if (!county) return null;

    return {
      stateFips: county.STATE as string,
      countyFips: county.COUNTY as string,
      countyName: county.NAME as string,
    };
  } catch {
    return null;
  }
}

// Census variable names differ by year
const CENSUS_YEARS: Array<{
  year: number;
  dataset: string;
  variable: string;
}> = [
  { year: 1990, dataset: "dec/sf1", variable: "P0010001" },
  { year: 2000, dataset: "dec/sf1", variable: "P001001" },
  { year: 2010, dataset: "dec/sf1", variable: "P001001" },
  { year: 2020, dataset: "dec/pl",  variable: "P1_001N" },
];

async function fetchCountyPop(
  year: number,
  dataset: string,
  variable: string,
  stateFips: string,
  countyFips: string
): Promise<number | null> {
  const url = `${CENSUS_API}/${year}/${dataset}?get=${variable}&for=county:${countyFips}&in=state:${stateFips}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    // Response is [[header_row], [value, state, county]]
    const valueRow = data?.[1];
    if (!valueRow) return null;
    const pop = parseInt(valueRow[0], 10);
    return isNaN(pop) ? null : pop;
  } catch {
    return null;
  }
}

export async function getCountyPopulation(
  lat: number,
  lng: number,
  birthYear: number | null,
  deathYear: number | null
): Promise<CensusEntry[]> {
  if (!lat || !lng) return [];

  const fips = await getFipsFromCoords(lat, lng);
  if (!fips) return [];

  // Only fetch census years that fall within or near the person's lifespan.
  // We always include the nearest census year after death so users see the
  // county's size at the time most relevant to the grave's context.
  const relevantYears = CENSUS_YEARS.filter(({ year }) => {
    if (birthYear && year < birthYear - 10) return false;
    if (deathYear && year > deathYear + 30) return false;
    return true;
  });

  if (relevantYears.length === 0) {
    // Lifespan predates all API coverage — return earliest available as reference
    relevantYears.push(CENSUS_YEARS[0]);
  }

  const results = await Promise.all(
    relevantYears.map(async ({ year, dataset, variable }) => {
      const pop = await fetchCountyPop(
        year,
        dataset,
        variable,
        fips.stateFips,
        fips.countyFips
      );
      if (pop === null) return null;
      const entry: CensusEntry = {
        year,
        population: pop,
        countyName: fips.countyName,
      };
      return entry;
    })
  );

  return results.filter((r): r is CensusEntry => r !== null);
}
