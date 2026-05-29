import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1200;

const SYSTEM_PROMPT = `You are writing a first-person spoken monologue for a grave marker audio guide.
Write 400–500 words as if the deceased is narrating their own life.

Core rules:
- Speak naturally in first person throughout — "I", "my", "we"
- Weave in the era's historical events they lived through at specific ages
- Include the feel of daily life in their era — what they would have seen, heard, used
- End with their death: "I died in [year] at [age] years old…" or similar
- If they outlived the average lifespan, note that warmly; if they died young, make it poignant
- Speak with warmth, dignity, and historical authenticity
- Write for the ear, not the eye — short sentences, vivid images, no lists or headers
- If an epitaph is provided, identify its source and meaning in the separate JSON fields
- Return ONLY valid JSON — no markdown, no explanation, no code fences

LOCATION RULE: The city/state/country provided is ONLY where this person is buried — not necessarily where they were born or lived.
Do not open with "I was born in [city]" unless a census record below explicitly confirms their birthplace.
Instead begin with the year: "I was born in [year], into a world…" or "The year was [year] when I came into this world…"
You may reference the burial location only as where they rest: "I came to rest here in [cemetery/state]."

MILITARY RULE: Only include military content if "militaryConfirmed: true" appears in the data.
If militaryConfirmed is false or absent, do NOT mention military service — even if you could infer it from dates.
Silence on unconfirmed service is more honest than speculation.

RECORDS RULE: If census, SSDI, or immigration records appear in the "Confirmed biographical records" section below,
treat those as verified facts and weave them naturally into the narrative.
They may confirm birthplace, occupation, immigration origin, last residence, and more.`;

interface CulturalCategory { id: string; summary: string; }
interface LifetimeLandmark  { year: number; age: number; event: string; }

interface SSDIRecord {
  name?: string;
  birthDate?: string;
  deathDate?: string;
  lastResidenceState?: string;
}

interface CensusRecord {
  year: number;
  occupation?: string;
  birthplace?: string;
  fatherBirthplace?: string;
  motherBirthplace?: string;
}

interface ImmigrationRecord {
  arrivalYear?: string;
  origin?: string;
  departurePort?: string;
  arrivalPort?: string;
}

function buildPrompt(params: {
  name?: string;
  birthDate?: string;
  deathDate?: string;
  birthYear?: number | null;
  deathYear?: number | null;
  ageAtDeath?: number | null;
  inscription?: string;
  epitaph?: string;
  symbols?: string[];
  city?: string;
  state?: string;
  country?: string;
  cemetery?: string;
  historical?: {
    birthEra?: string;
    deathEra?: string;
    lifeExpectancyAtDeath?: number;
    birthYearEvents?: string[];
    deathYearEvents?: string[];
    lifetimeLandmarks?: LifetimeLandmark[];
  };
  militaryContext?: {
    likelyConflict?: string;
    servedDuring?: string;
    theater?: string;
    role?: string;
    roleDescription?: string;
    historicalNote?: string;
    inferredFrom?: string;
  };
  culturalSummary?: CulturalCategory[];
  ssdi?: SSDIRecord[];
  historicalCensus?: CensusRecord[];
  immigration?: ImmigrationRecord[];
}): string {
  const lines: string[] = [];

  lines.push(`Name: ${params.name || "Unknown"}`);

  if (params.birthDate || params.deathDate) {
    lines.push(`Life dates: ${[params.birthDate, params.deathDate].filter(Boolean).join(" – ")}`);
  }
  if (params.ageAtDeath) lines.push(`Age at death: ${params.ageAtDeath}`);

  // Burial location — explicitly labeled so Claude doesn't assume birthplace
  const location = [params.city, params.state, params.country].filter(Boolean).join(", ");
  if (location) lines.push(`Burial location (NOT assumed birthplace): ${location}`);
  if (params.cemetery) lines.push(`Cemetery: ${params.cemetery}`);

  // Historical context
  const h = params.historical;
  if (h) {
    if (h.birthEra) lines.push(`Born in era: ${h.birthEra}`);
    if (h.deathEra && h.deathEra !== h.birthEra) lines.push(`Died in era: ${h.deathEra}`);
    if (h.lifeExpectancyAtDeath && params.ageAtDeath) {
      const diff = params.ageAtDeath - h.lifeExpectancyAtDeath;
      lines.push(
        `Life expectancy context: average lifespan then was ~${h.lifeExpectancyAtDeath} years; they lived ${
          diff > 0 ? diff + " years longer" : Math.abs(diff) + " years shorter"
        } than average`
      );
    }
    if (h.birthYearEvents?.length) {
      lines.push(`Events in their birth year (${params.birthYear}): ${h.birthYearEvents.join("; ")}`);
    }
    if (h.lifetimeLandmarks?.length) {
      const landmarks = h.lifetimeLandmarks
        .slice(0, 8)
        .map((l) => `Age ${l.age} (${l.year}): ${l.event}`)
        .join("; ");
      lines.push(`Major events they lived through: ${landmarks}`);
    }
    if (h.deathYearEvents?.length) {
      lines.push(`Events in their death year (${params.deathYear}): ${h.deathYearEvents.join("; ")}`);
    }
  }

  // Military context — only include if confirmed from inscription or symbols
  const m = params.militaryContext;
  const militaryConfirmed = m?.inferredFrom === "inscription" || m?.inferredFrom === "symbols";
  lines.push(`militaryConfirmed: ${militaryConfirmed}`);
  if (militaryConfirmed && m?.likelyConflict) {
    lines.push(`Military service: ${m.likelyConflict}`);
    if (m.servedDuring) lines.push(`Served: ${m.servedDuring}`);
    if (m.theater)      lines.push(`Theater: ${m.theater}`);
    if (m.role)         lines.push(`Role: ${m.role}`);
    if (m.roleDescription) lines.push(`Role context: ${m.roleDescription}`);
    if (m.historicalNote)  lines.push(`Historical note: ${m.historicalNote}`);
  }

  // Cultural context summaries
  if (params.culturalSummary?.length) {
    lines.push("\nEra context for this person's lifetime:");
    for (const c of params.culturalSummary) {
      lines.push(`  ${c.id}: ${c.summary}`);
    }
  }

  // Marker details
  if (params.symbols?.length) lines.push(`Symbols on marker: ${params.symbols.join("; ")}`);
  if (params.inscription) lines.push(`Full inscription: ${params.inscription}`);
  if (params.epitaph)     lines.push(`Epitaph: "${params.epitaph}"`);

  // Confirmed biographical records from external sources
  const hasRecords =
    params.ssdi?.length ||
    params.historicalCensus?.length ||
    params.immigration?.length;

  if (hasRecords) {
    lines.push("\nConfirmed biographical records (treat as verified facts):");

    if (params.ssdi?.length) {
      const s = params.ssdi[0];
      const parts = [
        s.name && `Name on record: ${s.name}`,
        s.birthDate && `Birth: ${s.birthDate}`,
        s.deathDate && `Death: ${s.deathDate}`,
        s.lastResidenceState && `Last known residence: ${s.lastResidenceState}`,
      ].filter(Boolean);
      if (parts.length) lines.push(`  SSDI: ${parts.join(", ")}`);
    }

    for (const c of (params.historicalCensus ?? [])) {
      const parts = [
        c.occupation && `occupation=${c.occupation}`,
        c.birthplace && `birthplace=${c.birthplace}`,
        c.fatherBirthplace && `father born in ${c.fatherBirthplace}`,
        c.motherBirthplace && `mother born in ${c.motherBirthplace}`,
      ].filter(Boolean);
      if (parts.length) lines.push(`  Census ${c.year}: ${parts.join(", ")}`);
    }

    if (params.immigration?.length) {
      const im = params.immigration[0];
      const parts = [
        im.origin && `from ${im.origin}`,
        im.arrivalYear && `arrived ${im.arrivalYear}`,
        im.departurePort && `departed ${im.departurePort}`,
        im.arrivalPort && `arrived at ${im.arrivalPort}`,
      ].filter(Boolean);
      if (parts.length) lines.push(`  Immigration: ${parts.join(", ")}`);
    }
  }

  return (
    lines.join("\n") +
    `

Based on all the above, return JSON with exactly these fields:

{
  "script": "The 400–500 word first-person monologue, written to be spoken aloud.",
  "epitaphSource": "If the epitaph is from a known source (Bible verse, hymn, poem, literary work), identify it here. Otherwise empty string.",
  "epitaphMeaning": "1–2 sentences on what this epitaph meant to families of that era. Empty string if no epitaph."
}`
  );
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key missing" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(body) }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    const rawJson = content.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    return NextResponse.json(JSON.parse(rawJson));
  } catch (error: unknown) {
    console.error("[story]", error);
    return NextResponse.json(
      { error: "Story generation failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
