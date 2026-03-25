import type { HistoricalContext, LifetimeLandmark } from "@/types";

// ── Life expectancy by birth decade (US historical averages) ─────────────────
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

// ── Historical era lookup ─────────────────────────────────────────────────────
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
  const match = ERAS.slice().reverse().find((e) => year >= e.start && year <= e.end);
  return match?.name ?? `${Math.floor(year / 10) * 10}s`;
}

// ── Curated US landmark events ────────────────────────────────────────────────
// Sourced from established historical record — used to show events a person
// lived through. No AI generation; all entries are verifiable facts.
const LANDMARK_EVENTS: Array<{ year: number; event: string }> = [
  { year: 1776, event: "Declaration of Independence signed" },
  { year: 1783, event: "Revolutionary War ended" },
  { year: 1803, event: "Louisiana Purchase — US territory doubled" },
  { year: 1812, event: "War of 1812 began with Britain" },
  { year: 1825, event: "Erie Canal opened, connecting the Great Lakes to the Atlantic" },
  { year: 1838, event: "Trail of Tears — forced relocation of Cherokee Nation" },
  { year: 1846, event: "Mexican-American War began" },
  { year: 1848, event: "California Gold Rush began" },
  { year: 1860, event: "Abraham Lincoln elected President" },
  { year: 1861, event: "Civil War began at Fort Sumter" },
  { year: 1863, event: "Emancipation Proclamation issued" },
  { year: 1865, event: "Civil War ended; President Lincoln assassinated" },
  { year: 1869, event: "Transcontinental Railroad completed at Promontory Summit, Utah" },
  { year: 1871, event: "Great Chicago Fire destroyed much of the city" },
  { year: 1876, event: "Telephone invented by Alexander Graham Bell" },
  { year: 1879, event: "Electric light bulb demonstrated by Thomas Edison" },
  { year: 1881, event: "President Garfield assassinated" },
  { year: 1886, event: "Statue of Liberty dedicated in New York Harbor" },
  { year: 1889, event: "Oklahoma Land Rush; Johnstown Flood killed over 2,200" },
  { year: 1893, event: "World's Columbian Exposition (World's Fair) held in Chicago" },
  { year: 1898, event: "Spanish-American War; US acquired Puerto Rico, Guam, Philippines" },
  { year: 1901, event: "President McKinley assassinated; Theodore Roosevelt took office" },
  { year: 1903, event: "Wright Brothers' first powered airplane flight at Kitty Hawk" },
  { year: 1906, event: "San Francisco earthquake and fire killed over 3,000" },
  { year: 1908, event: "Ford Model T introduced, beginning the automobile age" },
  { year: 1912, event: "RMS Titanic sank on its maiden voyage; over 1,500 died" },
  { year: 1914, event: "World War I began in Europe" },
  { year: 1917, event: "United States entered World War I" },
  { year: 1918, event: "World War I ended; Spanish Flu pandemic killed millions worldwide" },
  { year: 1920, event: "19th Amendment ratified — women granted the right to vote" },
  { year: 1927, event: "Charles Lindbergh completed first solo transatlantic flight" },
  { year: 1929, event: "Stock Market Crash triggered the Great Depression" },
  { year: 1933, event: "Prohibition ended with repeal of the 18th Amendment" },
  { year: 1935, event: "Social Security Act signed into law" },
  { year: 1939, event: "World War II began in Europe" },
  { year: 1941, event: "Attack on Pearl Harbor; US entered World War II" },
  { year: 1944, event: "D-Day — Allied invasion of Normandy" },
  { year: 1945, event: "World War II ended in both Europe and the Pacific" },
  { year: 1947, event: "Cold War began; Marshall Plan proposed" },
  { year: 1950, event: "Korean War began" },
  { year: 1953, event: "Korean War ended with armistice" },
  { year: 1954, event: "Supreme Court ruled school segregation unconstitutional (Brown v. Board)" },
  { year: 1955, event: "Rosa Parks arrested; Montgomery Bus Boycott launched" },
  { year: 1957, event: "Soviet Union launched Sputnik, first artificial satellite" },
  { year: 1962, event: "Cuban Missile Crisis brought US and USSR to the brink of nuclear war" },
  { year: 1963, event: "President Kennedy assassinated in Dallas" },
  { year: 1964, event: "Civil Rights Act signed into law" },
  { year: 1965, event: "Voting Rights Act signed; US combat troops deployed to Vietnam" },
  { year: 1968, event: "Martin Luther King Jr. and Robert Kennedy assassinated" },
  { year: 1969, event: "Apollo 11 moon landing — humans walked on the moon for the first time" },
  { year: 1973, event: "US combat involvement in Vietnam ended; Roe v. Wade decided" },
  { year: 1974, event: "President Nixon resigned amid Watergate scandal" },
  { year: 1979, event: "Iranian hostage crisis began" },
  { year: 1981, event: "President Reagan shot; AIDS epidemic recognized by CDC" },
  { year: 1986, event: "Space Shuttle Challenger disaster killed all seven crew members" },
  { year: 1989, event: "Berlin Wall fell; Cold War began to end" },
  { year: 1991, event: "Gulf War; Soviet Union dissolved" },
  { year: 1995, event: "Oklahoma City bombing killed 168" },
  { year: 2001, event: "September 11 terrorist attacks killed nearly 3,000" },
  { year: 2005, event: "Hurricane Katrina devastated New Orleans and Gulf Coast" },
  { year: 2008, event: "Global financial crisis; Barack Obama elected first Black president" },
  { year: 2012, event: "Sandy Hook school shooting" },
  { year: 2020, event: "COVID-19 pandemic; George Floyd killed, sparking nationwide protests" },
];

function getLandmarkEvents(
  birthYear: number,
  deathYear: number
): LifetimeLandmark[] {
  return LANDMARK_EVENTS.filter(
    (e) => e.year >= birthYear && e.year <= deathYear
  ).map((e) => ({
    year: e.year,
    age: e.year - birthYear,
    event: e.event,
  }));
}

// ── Wikipedia "Year in X" event fetching ─────────────────────────────────────
// Sentences matching this pattern are calendar metadata, not historical events.
const CALENDAR_NOISE =
  /leap year|common year|starting on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|Gregorian calendar|Julian calendar|Anno Domini|\bAD\b|\bCE\b|Common Era|millennium|century|decade|year of the \d|MDCC|MCMX|MCM|MCD|the \d{4}th year/i;

function extractEventSentences(text: string, max = 4): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s.length > 50 &&
        s.length < 400 &&
        !CALENDAR_NOISE.test(s) &&
        // Must start with a capital letter (real sentence, not a fragment)
        /^[A-Z]/.test(s)
    )
    .slice(0, max);
}

async function fetchYearEvents(
  year: number,
  state?: string
): Promise<string[]> {
  const timeout = AbortSignal.timeout(5000);

  // 1. Try state-specific article first (e.g. "1884 in Iowa")
  if (state) {
    const stateSlug = state.trim().replace(/\s+/g, "_");
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${year}_in_${stateSlug}`,
        { signal: timeout }
      );
      if (res.ok) {
        const data = await res.json();
        const sentences = extractEventSentences(data.extract ?? "", 3);
        if (sentences.length >= 2) return sentences;
      }
    } catch {
      // non-fatal, fall through
    }
  }

  // 2. Fall back to "Year in the United States"
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${year}_in_the_United_States`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data = await res.json();
      const sentences = extractEventSentences(data.extract ?? "", 4);
      if (sentences.length > 0) return sentences;
    }
  } catch {
    // non-fatal
  }

  // 3. Last resort: generic year article — filter out calendar noise aggressively
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${year}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data = await res.json();
      return extractEventSentences(data.extract ?? "", 3);
    }
  } catch {
    // non-fatal
  }

  return [];
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function getHistoricalContext(
  birthYear: number | null,
  deathYear: number | null,
  state?: string
): Promise<HistoricalContext> {
  const context: HistoricalContext = {};

  if (birthYear) {
    context.birthEra = getEra(birthYear);
    context.lifeExpectancyAtDeath = getLifeExpectancy(birthYear);
  }
  if (deathYear) {
    context.deathEra = getEra(deathYear);
  }

  // Fetch year events in parallel
  const [birthEvents, deathEvents] = await Promise.all([
    birthYear && birthYear >= 1776 && birthYear <= 2024
      ? fetchYearEvents(birthYear, state)
      : Promise.resolve([]),
    deathYear && deathYear >= 1776 && deathYear <= 2024
      ? fetchYearEvents(deathYear, state)
      : Promise.resolve([]),
  ]);

  if (birthEvents.length > 0) context.birthYearEvents = birthEvents;
  if (deathEvents.length > 0) context.deathYearEvents = deathEvents;

  // Landmark events they lived through
  if (birthYear && deathYear && deathYear > birthYear) {
    const landmarks = getLandmarkEvents(birthYear, deathYear);
    if (landmarks.length > 0) context.lifetimeLandmarks = landmarks;
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
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?${params}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const title = data.query?.search?.[0]?.title;
    return title
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
      : undefined;
  } catch {
    return undefined;
  }
}
