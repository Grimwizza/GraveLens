import type { MilitaryContext } from "@/types";

// ── Keyword detection ─────────────────────────────────────────────────────
const MILITARY_RE =
  /\b(war|veteran|vet\b|pvt|sgt|cpl|cpt|maj|col|gen|lt\b|ltr|ltc|rank|tank|infantry|cavalry|regiment|battalion|squadron|division|brigade|corps|platoon|company|army|navy|marine|marines|air\s*force|coast\s*guard|national\s*guard|served|service|honorabl[ey]\s*discharged|killed\s*in\s*action|k\.i\.a|died\s*in\s*service|medal|bronze\s*star|silver\s*star|purple\s*heart|doughboy|soldier|sailor|airman|pilot|gunner|medic|sniper|commander|captain|sergeant|corporal|private|lieutenant|major|colonel|general|admiral)\b/i;

// ── Known US conflicts with full contextual templates ─────────────────────
// roleDescription and historicalNote are pre-written factual text for each
// conflict, eliminating the need for a Claude API call on military markers.
// All content is verifiable historical fact — nothing is specific to the individual.
const CONFLICTS = [
  {
    name: "Civil War",
    keywords: ["civil war", "union army", "confederate", "c.s.a", "u.s.a.", "usa soldier"],
    usDates: "1861–1865",
    birthRange: [1820, 1850] as [number, number],
    serviceYears: [1861, 1865] as [number, number],
    theater: "Eastern and Western Theaters, United States",
    roleDescription:
      "Civil War soldiers on both sides were armed primarily with muzzle-loading rifle-muskets such as the Springfield Model 1861 or Enfield Pattern 1853. Infantry engagements were fought in massed linear formations at close range, making casualties extraordinarily high. Soldiers endured brutal field conditions — disease alone killed more than two men for every one lost in combat.",
    historicalNote:
      "The Civil War was the deadliest conflict in American history, claiming an estimated 620,000 to 750,000 soldiers' lives on both sides. It ended slavery in the United States and fundamentally redefined the relationship between the federal government and the states.",
  },
  {
    name: "Spanish-American War",
    keywords: ["spanish-american", "spanish american", "1898", "cuba", "philippines", "rough rider"],
    usDates: "1898–1899",
    birthRange: [1855, 1882] as [number, number],
    serviceYears: [1898, 1899] as [number, number],
    theater: "Cuba, Puerto Rico, and the Philippines",
    roleDescription:
      "American soldiers in the Spanish-American War fought in tropical climates largely unprepared for the conditions — disease, particularly yellow fever and dysentery, killed far more men than Spanish bullets. The war lasted only ten weeks but established the United States as a global imperial power with territories in the Caribbean and Pacific.",
    historicalNote:
      "The Spanish-American War of 1898 marked the United States' emergence onto the world stage as an imperial power. The conflict lasted only ten weeks but resulted in Spain ceding Cuba, Puerto Rico, Guam, and the Philippines, reshaping American foreign policy for the next century.",
  },
  {
    name: "World War I",
    keywords: [
      "world war i", "world war 1", "wwi", "ww1", "great war", "the great war",
      "a.e.f", "aef", "american expeditionary", "doughboy",
    ],
    usDates: "1917–1918",
    birthRange: [1873, 1902] as [number, number],
    serviceYears: [1917, 1918] as [number, number],
    theater: "Western Front, France and Belgium",
    roleDescription:
      "American Expeditionary Forces arrived in France in 1917 armed with Springfield M1903 rifles and supported by newly fielded weapons including machine guns, artillery, and early tanks. Soldiers fought from a network of trenches stretching hundreds of miles, enduring artillery barrages, poison gas attacks, and infantry assaults across no man's land in conditions of extreme hardship.",
    historicalNote:
      "Over 4 million Americans served in World War I, with more than 116,000 killed. The war introduced industrialized warfare on an unprecedented scale — artillery, poison gas, aircraft, and tanks transformed combat. American forces played a decisive role in breaking the stalemate on the Western Front in 1918.",
  },
  {
    name: "World War II",
    keywords: [
      "world war ii", "world war 2", "wwii", "ww2", "d-day", "normandy",
      "pacific theater", "european theater", "v-e day", "v-j day",
    ],
    usDates: "1941–1945",
    birthRange: [1895, 1928] as [number, number],
    serviceYears: [1941, 1945] as [number, number],
    theater: "European and Pacific Theaters",
    roleDescription:
      "American forces in World War II fought across two hemispheres — from the beaches of Normandy and North Africa in Europe to the island campaigns of the Pacific. Soldiers were equipped with the M1 Garand, the first standard-issue semi-automatic rifle in the world, and supported by an unprecedented industrial mobilization that produced tanks, ships, and aircraft at a scale no nation had ever achieved.",
    historicalNote:
      "Over 16 million Americans served in World War II, making it the largest military mobilization in US history. More than 400,000 Americans were killed. The war ended with the unconditional surrender of Germany in May 1945 and Japan in September 1945 following the use of atomic bombs on Hiroshima and Nagasaki.",
  },
  {
    name: "Korean War",
    keywords: ["korea", "korean war", "forgotten war", "38th parallel"],
    usDates: "1950–1953",
    birthRange: [1918, 1936] as [number, number],
    serviceYears: [1950, 1953] as [number, number],
    theater: "Korean Peninsula",
    roleDescription:
      "American soldiers in Korea fought in extreme conditions ranging from the blistering summers of the southern peninsula to the brutal winters of the Chosin Reservoir, where temperatures fell to −35°F. Equipped with M1 rifles and carbines, they faced both North Korean forces and, from late 1950, large numbers of Chinese People's Volunteer Army troops who entered the conflict.",
    historicalNote:
      'The Korean War, often called the "Forgotten War," lasted three years and cost over 36,000 American lives. It ended in an armistice rather than a peace treaty, leaving the Korean peninsula divided at roughly the same 38th parallel boundary where the conflict began — a division that persists to this day.',
  },
  {
    name: "Vietnam War",
    keywords: ["vietnam", "viet nam", "southeast asia", "mekong", "tet offensive"],
    usDates: "1965–1975",
    birthRange: [1930, 1957] as [number, number],
    serviceYears: [1965, 1975] as [number, number],
    theater: "South Vietnam, Cambodia, and Laos",
    roleDescription:
      "American troops in Vietnam fought an unconventional guerrilla war in dense jungle and rice paddy terrain against Viet Cong and North Vietnamese Army forces. Armed with the M16 rifle, soldiers faced ambushes, booby traps, and an enemy that blended into the civilian population. The average age of the combat soldier was 19, younger than any previous American war.",
    historicalNote:
      "Over 58,000 Americans were killed in Vietnam, and more than 300,000 were wounded. The war deeply divided American society, generated widespread anti-war protests, and ended with the fall of Saigon in April 1975. It remains one of the most contentious conflicts in American history.",
  },
  {
    name: "Gulf War",
    keywords: ["gulf war", "desert storm", "desert shield", "operation desert", "kuwait", "iraq"],
    usDates: "1990–1991",
    birthRange: [1950, 1973] as [number, number],
    serviceYears: [1990, 1991] as [number, number],
    theater: "Kuwait and southern Iraq",
    roleDescription:
      "American forces in Operation Desert Storm conducted one of the most decisive conventional military campaigns of the 20th century. Equipped with M1 Abrams tanks, Apache helicopters, and precision-guided munitions, coalition forces liberated Kuwait in a ground war that lasted just 100 hours. The conflict showcased the transformation of the US military since Vietnam toward high-technology combined-arms warfare.",
    historicalNote:
      "The Gulf War coalition of 34 nations drove Iraqi forces from Kuwait between August 1990 and February 1991. American forces suffered 148 battle deaths in the conflict. The swift victory led to widespread optimism about a new era of US military dominance, though it left the underlying regional tensions unresolved.",
  },
];

// Returns the conflict explicitly named in text, or inferred from birth year
function detectConflict(text: string, birthYear: number | null) {
  const lower = text.toLowerCase();

  for (const c of CONFLICTS) {
    if (c.keywords.some((k) => lower.includes(k))) return c;
  }

  if (birthYear) {
    for (const c of [...CONFLICTS].reverse()) {
      const [minB, maxB] = c.birthRange;
      if (birthYear >= minB && birthYear <= maxB) {
        const ageAtStart = c.serviceYears[0] - birthYear;
        if (ageAtStart >= 17 && ageAtStart <= 50) return c;
      }
    }
  }
  return null;
}

export function extractMilitaryTerms(inscription: string, symbols: string[]): string {
  const all = [inscription, ...symbols].join(" ");
  if (!MILITARY_RE.test(all)) return "";

  const terms: string[] = [];

  const rankMatch = all.match(
    /\b(tank\s+commander|pilot|gunner|medic|sniper|infantry(?:man)?|cavalry(?:man)?|sailor|airman|doughboy|corpsman|rifleman|sergeant\s+major|first\s+sergeant|master\s+sergeant|staff\s+sergeant|technical\s+sergeant|gunnery\s+sergeant|lance\s+corporal|petty\s+officer|chief\s+petty|warrant\s+officer)\b/gi
  );
  if (rankMatch) terms.push(...rankMatch.map((r) => r.trim()));

  for (const c of CONFLICTS) {
    for (const k of c.keywords) {
      if (all.toLowerCase().includes(k)) {
        terms.push(c.name);
        break;
      }
    }
  }

  return [...new Set(terms)].join(" ");
}

export function hasMilitaryIndicators(inscription: string, symbols: string[]): boolean {
  return MILITARY_RE.test([inscription, ...symbols].join(" "));
}

// ── Local template-based military context ─────────────────────────────────
// Replaces the previous Claude API call. All content is pre-written factual
// historical text — no AI generation needed, zero API cost, instant response.
export async function getMilitaryContext(params: {
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  inscription: string;
  symbols: string[];
}): Promise<MilitaryContext | null> {
  const { birthYear, inscription, symbols } = params;

  if (!hasMilitaryIndicators(inscription, symbols)) return null;

  const conflict = detectConflict([inscription, ...symbols].join(" "), birthYear);
  if (!conflict) return null;

  // Extract role from inscription if present
  const roleMatch = [inscription, ...symbols]
    .join(" ")
    .match(
      /\b(tank\s+commander|pilot|gunner|medic|sniper|infantry(?:man)?|cavalry(?:man)?|sailor|airman|doughboy|corpsman|rifleman|sergeant\s+major|first\s+sergeant|master\s+sergeant|staff\s+sergeant|technical\s+sergeant|gunnery\s+sergeant|lance\s+corporal|petty\s+officer|chief\s+petty|warrant\s+officer|pvt|sgt|cpl|cpt|maj|col|gen|lt\b|captain|sergeant|corporal|private|lieutenant|major|colonel|general|admiral|commander)\b/i
    );
  const role = roleMatch ? roleMatch[0].trim() : "";

  return {
    likelyConflict: conflict.name,
    servedDuring: conflict.usDates,
    theater: conflict.theater,
    role: role || undefined,
    roleDescription: conflict.roleDescription,
    historicalNote: conflict.historicalNote,
    inferredFrom: conflict.keywords.some((k) =>
      [inscription, ...symbols].join(" ").toLowerCase().includes(k)
    )
      ? "inscription"
      : "dates",
  };
}
