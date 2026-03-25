import Anthropic from "@anthropic-ai/sdk";
import type { MilitaryContext } from "@/types";

// ── Keyword detection ─────────────────────────────────────────────────────
const MILITARY_RE =
  /\b(war|veteran|vet\b|pvt|sgt|cpl|cpt|maj|col|gen|lt\b|ltr|ltc|rank|tank|infantry|cavalry|regiment|battalion|squadron|division|brigade|corps|platoon|company|army|navy|marine|marines|air\s*force|coast\s*guard|national\s*guard|served|service|honorabl[ey]\s*discharged|killed\s*in\s*action|k\.i\.a|died\s*in\s*service|medal|bronze\s*star|silver\s*star|purple\s*heart|doughboy|soldier|sailor|airman|pilot|gunner|medic|sniper|commander|captain|sergeant|corporal|private|lieutenant|major|colonel|general|admiral)\b/i;

// ── Known US conflicts with inference data ────────────────────────────────
const CONFLICTS = [
  {
    name: "Civil War",
    keywords: ["civil war", "union army", "confederate", "c.s.a", "u.s.a.", "usa soldier"],
    usDates: "1861–1865",
    birthRange: [1820, 1850] as [number, number],
    serviceYears: [1861, 1865] as [number, number],
  },
  {
    name: "Spanish-American War",
    keywords: ["spanish-american", "spanish american", "1898", "cuba", "philippines", "rough rider"],
    usDates: "1898–1899",
    birthRange: [1855, 1882] as [number, number],
    serviceYears: [1898, 1899] as [number, number],
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
  },
  {
    name: "Korean War",
    keywords: ["korea", "korean war", "forgotten war", "38th parallel"],
    usDates: "1950–1953",
    birthRange: [1918, 1936] as [number, number],
    serviceYears: [1950, 1953] as [number, number],
  },
  {
    name: "Vietnam War",
    keywords: ["vietnam", "viet nam", "southeast asia", "mekong", "tet offensive"],
    usDates: "1965–1975",
    birthRange: [1930, 1957] as [number, number],
    serviceYears: [1965, 1975] as [number, number],
  },
  {
    name: "Gulf War",
    keywords: ["gulf war", "desert storm", "desert shield", "operation desert", "kuwait", "iraq"],
    usDates: "1990–1991",
    birthRange: [1950, 1973] as [number, number],
    serviceYears: [1990, 1991] as [number, number],
  },
];

// Returns the conflict explicitly named in text, or inferred from birth year
function detectConflict(text: string, birthYear: number | null) {
  const lower = text.toLowerCase();

  // 1. Explicit keyword match
  for (const c of CONFLICTS) {
    if (c.keywords.some((k) => lower.includes(k))) return c;
  }

  // 2. Infer from birth year — pick the conflict whose typical service age fits best
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

// Extract military terms from inscription + symbols for use as NARA search boost
export function extractMilitaryTerms(inscription: string, symbols: string[]): string {
  const all = [inscription, ...symbols].join(" ");
  if (!MILITARY_RE.test(all)) return "";

  const terms: string[] = [];

  // Extract ranks / roles
  const rankMatch = all.match(
    /\b(tank\s+commander|pilot|gunner|medic|sniper|infantry(?:man)?|cavalry(?:man)?|sailor|airman|doughboy|corpsman|rifleman|sergeant\s+major|first\s+sergeant|master\s+sergeant|staff\s+sergeant|technical\s+sergeant|gunnery\s+sergeant|lance\s+corporal|petty\s+officer|chief\s+petty|warrant\s+officer)\b/gi
  );
  if (rankMatch) terms.push(...rankMatch.map((r) => r.trim()));

  // Extract conflict names
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

// ── Claude-powered contextual military history ────────────────────────────
// This generates factual *historical* context about the conflict and role —
// NOT fabricated claims about the individual. Clearly scoped to what is
// historically verifiable about the era, branch, and role.
export async function getMilitaryContext(params: {
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  inscription: string;
  symbols: string[];
}): Promise<MilitaryContext | null> {
  const { name, birthYear, deathYear, inscription, symbols } = params;

  if (!hasMilitaryIndicators(inscription, symbols)) return null;

  const conflict = detectConflict([inscription, ...symbols].join(" "), birthYear);

  const client = new Anthropic();

  const prompt = `A grave marker has been photographed with the following details:
- Name: ${name || "Unknown"}
- Birth year: ${birthYear ?? "unknown"}
- Death year: ${deathYear ?? "unknown"}
- Full inscription: "${inscription}"
- Symbols / emblems on marker: ${symbols.length ? symbols.join("; ") : "none noted"}
${conflict ? `- Conflict already identified: ${conflict.name} (${conflict.usDates})` : ""}

Provide military historical context for this person's likely service. Return ONLY valid JSON:
{
  "likelyConflict": "Full conflict name, e.g. 'World War I'",
  "servedDuring": "Approximate US service dates, e.g. '1917–1918'",
  "theater": "Most likely theater of operations based on the conflict and any location clues, e.g. 'Western Front, France and Belgium'",
  "role": "The specific military role or rank visible on the marker, e.g. 'Tank Commander'",
  "roleDescription": "2–3 factual sentences describing what this role involved in this specific conflict — equipment used, duties, conditions, historical significance. Do not claim specific facts about this individual.",
  "historicalNote": "1–2 sentences of broader historical context relevant to service in this era that would help a family member understand what their relative experienced.",
  "inferredFrom": "inscription"
}

Critical rules:
- Every claim in roleDescription and historicalNote must be verifiable historical fact, not speculation about this person specifically.
- If the conflict is World War I and the role is Tank Commander: describe WWI tanks (Mark IV, Renault FT, etc.), crew size, conditions, the limited but pivotal role tanks played on the Western Front.
- Set a field to null if you genuinely cannot determine it — do not guess wildly.
- Do not use the phrase "may have" or "likely served" when describing the role itself — describe what the role historically entailed.`;

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system:
        "You are a military historian providing verified historical context about US military service. Return only valid JSON — no markdown fences, no explanation.",
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "";
    const raw = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const ctx = JSON.parse(raw) as MilitaryContext;

    // If Claude missed the conflict we already detected, fill it in
    if (!ctx.likelyConflict && conflict) {
      ctx.likelyConflict = conflict.name;
      ctx.servedDuring = conflict.usDates;
    }

    return ctx;
  } catch {
    // Graceful fallback — return basic inferred data without Claude
    if (conflict) {
      return {
        likelyConflict: conflict.name,
        servedDuring: conflict.usDates,
        inferredFrom: "dates",
      };
    }
    return null;
  }
}
