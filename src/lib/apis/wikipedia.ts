import type { HistoricalContext } from "@/types";

// Life expectancy lookup by birth decade (US historical data)
const LIFE_EXPECTANCY: Record<number, number> = {
  1800: 39, 1810: 39, 1820: 40, 1830: 40, 1840: 41,
  1850: 38, 1860: 41, 1870: 43, 1880: 44, 1890: 44,
  1900: 49, 1910: 51, 1920: 58, 1930: 60, 1940: 64,
  1950: 68, 1960: 70, 1970: 71, 1980: 74, 1990: 75,
  2000: 77, 2010: 78, 2020: 76,
};

function getLifeExpectancy(birthYear: number): number {
  const decade = Math.floor(birthYear / 10) * 10;
  return LIFE_EXPECTANCY[decade] ?? 70;
}

const ERAS: Array<{ start: number; end: number; name: string }> = [
  { start: 1775, end: 1800, name: "Early American Republic" },
  { start: 1800, end: 1830, name: "Early 19th Century" },
  { start: 1830, end: 1861, name: "Antebellum Era" },
  { start: 1861, end: 1865, name: "Civil War Era" },
  { start: 1865, end: 1900, name: "Gilded Age" },
  { start: 1900, end: 1920, name: "Progressive Era" },
  { start: 1914, end: 1918, name: "World War I Era" },
  { start: 1920, end: 1929, name: "Roaring Twenties" },
  { start: 1929, end: 1940, name: "Great Depression Era" },
  { start: 1939, end: 1945, name: "World War II Era" },
  { start: 1945, end: 1964, name: "Post-War Era" },
  { start: 1955, end: 1975, name: "Cold War / Vietnam Era" },
  { start: 1975, end: 2000, name: "Late 20th Century" },
  { start: 2000, end: 2025, name: "21st Century" },
];

function getEra(year: number): string {
  const match = ERAS.slice()
    .reverse()
    .find((e) => year >= e.start && year <= e.end);
  return match?.name ?? `${Math.floor(year / 10) * 10}s`;
}

export async function getHistoricalContext(
  birthYear: number | null,
  deathYear: number | null
): Promise<HistoricalContext> {
  const context: HistoricalContext = {};

  if (birthYear) {
    context.birthEra = getEra(birthYear);
    context.lifeExpectancyAtDeath = getLifeExpectancy(birthYear);
  }
  if (deathYear) {
    context.deathEra = getEra(deathYear);
  }

  // Fetch Wikipedia "Year X" summary for death year as world events
  if (deathYear && deathYear >= 1850 && deathYear <= 2020) {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${deathYear}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.extract) {
          // Extract first 2 sentences as a world events snippet
          const sentences = data.extract.split(/(?<=[.!?])\s+/).slice(0, 2);
          context.worldEvents = sentences;
        }
      }
    } catch {
      // Non-fatal
    }
  }

  return context;
}

export async function searchCemeteryWikipedia(
  cemeteryName: string
): Promise<string | undefined> {
  if (!cemeteryName) return undefined;

  try {
    const params = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: cemeteryName + " cemetery",
      format: "json",
      origin: "*",
      srlimit: "1",
    });

    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return undefined;
    const data = await res.json();
    const title = data.query?.search?.[0]?.title;
    if (title) {
      return `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
    }
  } catch {
    // Non-fatal
  }

  return undefined;
}
