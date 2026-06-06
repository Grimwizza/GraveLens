/**
 * researchLinks.ts
 * Zero-cost deep-link generators for P3 research sources.
 *
 * Produces pre-filled search URLs for four source categories:
 *   P3.1 — WWI Draft Registration Cards (NARA AAD + FamilySearch)
 *   P3.2 — State death certificate archives
 *   P3.3 — Modern obituary databases (post-1963 deaths)
 *   P3.4 — Fraternal organization archives (Masonic, IOOF, GAR, etc.)
 *
 * No API calls — pure URL construction from data already in the lookup request.
 */

import { toStateCode } from "@/lib/stateUtils";

export interface ResearchLink {
  label: string;
  sub: string;
  url: string;
  icon: string;
  category: "wwiDraft" | "stateVital" | "modernObit" | "fraternal";
}

// ── P3.1: WWI Draft Registration Cards ───────────────────────────────────────

const WWI_BIRTH_RANGE: [number, number] = [1872, 1900];

function isWwiBirthYear(birthYear: number | null): boolean {
  if (!birthYear) return false;
  return birthYear >= WWI_BIRTH_RANGE[0] && birthYear <= WWI_BIRTH_RANGE[1];
}

export function buildWwiDraftLinks(params: {
  firstName: string;
  lastName: string;
  birthYear: number | null;
  state: string;
  likelyConflict?: string | null;
}): ResearchLink[] {
  const { firstName, lastName, birthYear, state, likelyConflict } = params;
  const isWwi = likelyConflict?.toLowerCase().includes("world war i") || isWwiBirthYear(birthYear);
  if (!isWwi || !lastName) return [];

  const fn = encodeURIComponent(firstName);
  const ln = encodeURIComponent(lastName);
  const st = state ? encodeURIComponent(state) : "";

  // Birth year ±1 for draft card searches (age reporting varied ±1 year)
  const byLo = birthYear ? birthYear - 1 : null;
  const byHi = birthYear ? birthYear + 1 : null;

  return [
    {
      label: "WWI Draft Cards (FamilySearch)",
      sub: "24 million draft registration cards 1917–1918 — physical description, employer, and nearest relative",
      url: [
        `https://www.familysearch.org/search/collection/1968530?q.givenName=${fn}&q.surname=${ln}`,
        byLo != null ? `&q.birthLikeDate.from=${byLo}&q.birthLikeDate.to=${byHi}` : "",
        st ? `&q.residencePlace=${st}` : "",
      ].join(""),
      icon: "📋",
      category: "wwiDraft",
    },
    {
      label: "WWI Draft Cards (NARA Online)",
      sub: "National Archives digitized draft registration cards — browse by name and state",
      url: `https://aad.archives.gov/aad/fielded-search.jsp?dt=893&cat=GP44&tf=F&q=${encodeURIComponent(`${lastName} ${firstName}`)}&bc=&rpp=10&pg=1`,
      icon: "🏛️",
      category: "wwiDraft",
    },
  ];
}

// ── P3.2: State Death Certificate Deep Links ──────────────────────────────────

// FamilySearch collection IDs for state death records by state.
// Where FS doesn't have coverage, link to state archives directly.
const STATE_DEATH_RECORDS: Record<string, { label: string; url: (y: number | null) => string }> = {
  AL: { label: "Alabama Death Records", url: (y) => `https://www.familysearch.org/search/collection/1417613?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  AK: { label: "Alaska Vital Records",  url: ()  => "https://www.hss.state.ak.us/dph/bvs/" },
  AZ: { label: "Arizona Death Records", url: ()  => "https://genealogy.az.gov/death" },
  AR: { label: "Arkansas Death Records",url: (y) => `https://www.familysearch.org/search/collection/2177960?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  CA: { label: "California Death Records",url:(y) => `https://www.familysearch.org/search/collection/2173770?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  CO: { label: "Colorado Death Records", url: (y) => `https://www.familysearch.org/search/collection/1417614?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  CT: { label: "Connecticut Death Records",url:(y)=> `https://www.familysearch.org/search/collection/1417615?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  DE: { label: "Delaware Death Records", url: ()  => "https://archives.delaware.gov/vital-statistics/" },
  FL: { label: "Florida Death Records",  url: (y) => `https://www.familysearch.org/search/collection/1408913?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  GA: { label: "Georgia Death Records",  url: (y) => `https://www.familysearch.org/search/collection/1924523?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  ID: { label: "Idaho Death Records",    url: ()  => "https://apps.healthandwelfare.idaho.gov/Health/VitalStatistics/tabid/1120/Default.aspx" },
  IL: { label: "Illinois Death Records", url: (y) => `https://www.familysearch.org/search/collection/1408913?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  IN: { label: "Indiana Death Records",  url: (y) => `https://www.familysearch.org/search/collection/1419922?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  IA: { label: "Iowa Death Records",     url: (y) => `https://www.familysearch.org/search/collection/1887780?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  KS: { label: "Kansas Death Records",   url: (y) => `https://www.familysearch.org/search/collection/1417625?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  KY: { label: "Kentucky Death Records", url: (y) => `https://www.familysearch.org/search/collection/1420765?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  LA: { label: "Louisiana Death Records",url: (y) => `https://www.familysearch.org/search/collection/1420777?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  ME: { label: "Maine Death Records",    url: (y) => `https://www.familysearch.org/search/collection/1417669?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  MD: { label: "Maryland Death Records", url: (y) => `https://www.familysearch.org/search/collection/1417670?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  MA: { label: "Massachusetts Death Records",url:(y)=>`https://www.familysearch.org/search/collection/1417671?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  MI: { label: "Michigan Death Records", url: (y) => `https://www.familysearch.org/search/collection/1417672?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  MN: { label: "Minnesota Death Records",url: (y) => `https://www.familysearch.org/search/collection/1417673?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  MS: { label: "Mississippi Death Records",url:(y)=> `https://www.familysearch.org/search/collection/1417674?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  MO: { label: "Missouri Death Records", url: (y) => `https://www.familysearch.org/search/collection/1417675?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  MT: { label: "Montana Death Records",  url: (y) => `https://www.familysearch.org/search/collection/1417676?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  NE: { label: "Nebraska Death Records", url: (y) => `https://www.familysearch.org/search/collection/1417677?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  NV: { label: "Nevada Death Records",   url: ()  => "https://genealogy.nv.gov/vital-records/death-certificates/" },
  NH: { label: "New Hampshire Death Records",url:(y)=>`https://www.familysearch.org/search/collection/1417679?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  NJ: { label: "New Jersey Death Records",url:(y) => `https://www.familysearch.org/search/collection/1417680?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  NM: { label: "New Mexico Death Records",url:()  => "https://www.newmexicovitalrecords.com/" },
  NY: { label: "New York Death Records", url: (y) => `https://www.familysearch.org/search/collection/1417681?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  NC: { label: "North Carolina Death Records",url:(y)=>`https://www.familysearch.org/search/collection/1417682?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  ND: { label: "North Dakota Death Records",url:()  => "https://www.hhs.nd.gov/vital-records" },
  OH: { label: "Ohio Death Records",     url: (y) => `https://www.familysearch.org/search/collection/1417684?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  OK: { label: "Oklahoma Death Records", url: (y) => `https://www.familysearch.org/search/collection/1417685?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  OR: { label: "Oregon Death Records",   url: (y) => `https://www.familysearch.org/search/collection/1417686?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  PA: { label: "Pennsylvania Death Records",url:(y)=> `https://www.familysearch.org/search/collection/1417687?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  RI: { label: "Rhode Island Death Records",url:(y)=> `https://www.familysearch.org/search/collection/1417688?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  SC: { label: "South Carolina Death Records",url:(y)=>`https://www.familysearch.org/search/collection/1417689?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  SD: { label: "South Dakota Death Records",url:()  => "https://doh.sd.gov/records/vital/" },
  TN: { label: "Tennessee Death Records",url: (y) => `https://www.familysearch.org/search/collection/1417691?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  TX: { label: "Texas Death Records",    url: (y) => `https://www.familysearch.org/search/collection/1417692?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  UT: { label: "Utah Death Records",     url: (y) => `https://www.familysearch.org/search/collection/1417693?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  VT: { label: "Vermont Death Records",  url: (y) => `https://www.familysearch.org/search/collection/1417694?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  VA: { label: "Virginia Death Records", url: (y) => `https://www.familysearch.org/search/collection/1417695?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  WA: { label: "Washington Death Records",url:(y) => `https://www.familysearch.org/search/collection/1417697?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  WV: { label: "West Virginia Death Records",url:(y)=>`https://www.familysearch.org/search/collection/1417698?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  WI: { label: "Wisconsin Death Records",url: (y) => `https://www.familysearch.org/search/collection/1417699?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
  WY: { label: "Wyoming Death Records",  url: ()  => "https://health.wyo.gov/familyhealth/vital-records/death/" },
  DC: { label: "DC Death Records",       url: (y) => `https://www.familysearch.org/search/collection/1417616?q.deathLikeDate.from=${y ?? ""}&q.deathLikeDate.to=${y ?? ""}` },
};

export function buildStateDeathLinks(params: {
  firstName: string;
  lastName: string;
  deathYear: number | null;
  state: string;
}): ResearchLink[] {
  const { firstName, lastName, deathYear, state } = params;
  if (!state || !lastName) return [];

  const stateCode = toStateCode(state);
  const record = STATE_DEATH_RECORDS[stateCode];
  if (!record) return [];

  const fn = encodeURIComponent(firstName);
  const ln = encodeURIComponent(lastName);

  // ±1 year to catch records where death year was transcribed off by one
  const dyLo = deathYear ? deathYear - 1 : null;
  const dyHi = deathYear ? deathYear + 1 : null;

  const baseUrl = record.url(deathYear);

  let url = baseUrl;
  if (url.includes("familysearch.org/search/collection")) {
    // Replace exact year with ±1 range and append name parameters
    if (dyLo != null) {
      url = url
        .replace(/q\.deathLikeDate\.from=[^&]*/g, `q.deathLikeDate.from=${dyLo}`)
        .replace(/q\.deathLikeDate\.to=[^&]*/g,   `q.deathLikeDate.to=${dyHi}`);
    }
    url += `&q.givenName=${fn}&q.surname=${ln}`;
  }

  return [
    {
      label: record.label,
      sub: `Official death certificate${deathYear ? ` — ${deathYear} ±1 yr` : ""} — cause of death, informant, parents' birthplaces`,
      url,
      icon: "📜",
      category: "stateVital",
    },
  ];
}

// ── P3.3: Modern Obituary Links (post-1963) ───────────────────────────────────

export function buildModernObituaryLinks(params: {
  firstName: string;
  lastName: string;
  deathYear: number | null;
}): ResearchLink[] {
  const { firstName, lastName, deathYear } = params;
  if (!lastName) return [];
  if (!deathYear) return [];
  // Chronicling America covers to 1963; only surface modern links for post-1963
  if (deathYear <= 1963) return [];

  const fn = encodeURIComponent(firstName);
  const ln = encodeURIComponent(lastName);
  const fullName = encodeURIComponent(`${firstName} ${lastName}`.trim());

  // ±1 year window to catch obituaries published in adjacent calendar year
  const dyLo = deathYear ? deathYear - 1 : null;
  const dyHi = deathYear ? deathYear + 1 : null;

  return [
    {
      label: "Legacy.com Obituaries",
      sub: "Free obituary search — major US newspapers since 1998",
      url: [
        `https://www.legacy.com/obituaries/search/?firstName=${fn}&lastName=${ln}`,
        dyLo != null ? `&ddaFrom=${dyLo}&ddaTo=${dyHi}` : "",
      ].join(""),
      icon: "📰",
      category: "modernObit",
    },
    {
      label: "GenealogyBank Obituaries",
      sub: "Obituaries from 6,500+ US newspapers — includes small-town papers",
      url: [
        `https://www.genealogybank.com/find/obituaries?fn=${fn}&ln=${ln}`,
        dyLo != null ? `&dr=${dyLo}-${dyHi}` : "",
      ].join(""),
      icon: "📰",
      category: "modernObit",
    },
    {
      label: "Newspapers.com",
      sub: "Historical and modern newspaper archives — searchable full text",
      url: [
        `https://www.newspapers.com/search/#query=${fullName}`,
        dyLo != null ? `&dr_year=${dyLo}-${dyHi}` : "",
      ].join(""),
      icon: "🗞️",
      category: "modernObit",
    },
  ];
}

// ── P3.4: Fraternal Organization Archive Links ────────────────────────────────

interface FraternalOrg {
  keywords: string[];
  links: Array<{ label: string; sub: string; url: string; icon: string }>;
}

const FRATERNAL_ORGS: FraternalOrg[] = [
  {
    keywords: ["masonic", "freemason", "mason", "square and compass", "freemasonry"],
    links: [
      {
        label: "Masonic Library & Museum",
        sub: "National Masonic archive — membership rosters, lodge histories",
        url: "https://www.nationalheritagemuseum.org/research/",
        icon: "🔷",
      },
      {
        label: "FamilySearch: Masonic Records",
        sub: "Digitized lodge membership rolls and biographical files",
        url: "https://www.familysearch.org/search/catalog?keywords=masonic",
        icon: "🌳",
      },
    ],
  },
  {
    keywords: ["odd fellows", "ioof", "i.o.o.f.", "three links", "three chain links"],
    links: [
      {
        label: "IOOF Genealogy Research",
        sub: "Independent Order of Odd Fellows — lodge records and membership files",
        url: "https://ioof.org/",
        icon: "🔗",
      },
      {
        label: "FamilySearch: Odd Fellows",
        sub: "Digitized Odd Fellows lodge records and membership lists",
        url: "https://www.familysearch.org/search/catalog?keywords=odd+fellows",
        icon: "🌳",
      },
    ],
  },
  {
    keywords: ["grand army", "gar", "g.a.r.", "union veteran", "civil war veteran"],
    links: [
      {
        label: "GAR Records (NARA)",
        sub: "Grand Army of the Republic — Civil War Union veteran pension and service files",
        url: "https://www.archives.gov/veterans/military-service-records/pre-ww-1-records.html",
        icon: "🎖️",
      },
      {
        label: "Sons of Union Veterans",
        sub: "GAR successor organization — rosters, camp records, and monument locations",
        url: "https://suvcw.org/research/",
        icon: "🇺🇸",
      },
    ],
  },
  {
    keywords: ["wrc", "w.r.c.", "women's relief corps", "women relief corps"],
    links: [
      {
        label: "Women's Relief Corps Records",
        sub: "Auxiliary to the GAR — member rolls and meeting minutes",
        url: "https://www.archives.gov/research/order/women.html",
        icon: "🌸",
      },
    ],
  },
  {
    keywords: ["woodmen of the world", "wow", "w.o.w.", "woodmen"],
    links: [
      {
        label: "Woodmen of the World Archives",
        sub: "Fraternal benefit society records — death benefits, member files",
        url: "https://woodmen.com/heritage/",
        icon: "🌲",
      },
    ],
  },
  {
    keywords: ["eastern star", "order of the eastern star", "oes"],
    links: [
      {
        label: "Order of the Eastern Star",
        sub: "Masonic-affiliated organization — chapter records and membership",
        url: "https://www.easternstar.org/",
        icon: "⭐",
      },
    ],
  },
  {
    keywords: ["knights of pythias", "pythias", "fcb"],
    links: [
      {
        label: "Knights of Pythias Records",
        sub: "Lodge membership rolls and benefit records 1864–present",
        url: "https://www.pythias.org/",
        icon: "⚔️",
      },
    ],
  },
  {
    keywords: ["elks", "bpoe", "b.p.o.e.", "benevolent protective"],
    links: [
      {
        label: "Elks Lodge Records",
        sub: "BPOE membership files and lodge histories",
        url: "https://www.elks.org/",
        icon: "🦌",
      },
    ],
  },
];

export function buildFraternalLinks(params: {
  inscription: string;
  symbols: string[];
}): ResearchLink[] {
  const { inscription, symbols } = params;
  const combined = [inscription, ...symbols].join(" ").toLowerCase();
  const results: ResearchLink[] = [];
  const seen = new Set<string>();

  for (const org of FRATERNAL_ORGS) {
    const matched = org.keywords.some((kw) => combined.includes(kw));
    if (!matched) continue;

    for (const link of org.links) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      results.push({ ...link, category: "fraternal" });
    }
  }

  return results;
}

// ── Main builder — composes all four ──────────────────────────────────────────

export function buildAllResearchLinks(params: {
  firstName: string;
  lastName: string;
  birthYear: number | null;
  deathYear: number | null;
  state: string;
  inscription: string;
  symbols: string[];
  likelyConflict?: string | null;
}): ResearchLink[] {
  return [
    ...buildWwiDraftLinks(params),
    ...buildStateDeathLinks(params),
    ...buildModernObituaryLinks(params),
    ...buildFraternalLinks(params),
  ];
}
