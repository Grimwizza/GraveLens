import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

// Uses Haiku — this is a creative writing task, not vision analysis.
// Haiku produces excellent narrative prose at ~$0.003/call.
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You are a historical narrator for a genealogy app. Your role is to write
evocative, historically accurate prose that helps people connect with the lives of those
whose graves they have photographed.

Rules:
- Write in third-person perspective about the era and context, not directly about the individual
- Focus on what is historically verifiable about their time and place
- Never fabricate specifics not evidenced by the marker (do not invent an occupation, family, or cause of death)
- Be thoughtful and respectful — this is about someone's ancestor
- Keep the narrative to 2–3 paragraphs
- Do not use filler phrases like "little is known" or "we can only imagine"
- Return ONLY valid JSON — no markdown, no explanation, no code fences`;

function buildPrompt(params: {
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  birthDate: string;
  deathDate: string;
  ageAtDeath: number | null;
  city?: string;
  state?: string;
  country?: string;
  inscription: string;
  epitaph: string;
  symbols: string[];
  birthEra?: string;
  deathEra?: string;
  lifeExpectancyAtDeath?: number;
  militaryConflict?: string;
  militaryTheater?: string;
  militaryRole?: string;
}): string {
  const lines: string[] = [];

  lines.push(`Name: ${params.name || "Unknown"}`);

  if (params.birthDate || params.deathDate) {
    lines.push(
      `Life dates: ${[params.birthDate, params.deathDate].filter(Boolean).join(" – ")}`
    );
  }

  if (params.ageAtDeath) lines.push(`Age at death: ${params.ageAtDeath}`);

  if (params.city || params.state) {
    lines.push(
      `Location: ${[params.city, params.state, params.country].filter(Boolean).join(", ")}`
    );
  }

  if (params.birthEra) lines.push(`Born in era: ${params.birthEra}`);
  if (params.deathEra && params.deathEra !== params.birthEra)
    lines.push(`Died in era: ${params.deathEra}`);

  if (
    params.lifeExpectancyAtDeath &&
    params.ageAtDeath &&
    Math.abs(params.ageAtDeath - params.lifeExpectancyAtDeath) >= 5
  ) {
    const diff = params.ageAtDeath - params.lifeExpectancyAtDeath;
    lines.push(
      `Life expectancy context: average lifespan in their birth era was ~${params.lifeExpectancyAtDeath} years; they lived ${diff > 0 ? diff + " years longer" : Math.abs(diff) + " years shorter"} than average`
    );
  }

  if (params.militaryConflict) {
    lines.push(`Military service: ${params.militaryConflict}`);
    if (params.militaryTheater) lines.push(`Theater: ${params.militaryTheater}`);
    if (params.militaryRole) lines.push(`Role: ${params.militaryRole}`);
  }

  if (params.symbols.length > 0) {
    lines.push(`Symbols on marker: ${params.symbols.join("; ")}`);
  }

  if (params.inscription) {
    lines.push(`Full inscription: ${params.inscription}`);
  }

  if (params.epitaph) {
    lines.push(`Epitaph: "${params.epitaph}"`);
  }

  return (
    lines.join("\n") +
    `

Based on the above, return JSON with exactly these fields:

{
  "narrative": "2–3 paragraph historical narrative about what life was like for someone of this era, place, and background. Ground the story in the specific era, region, and any marker evidence (military service, fraternal symbols, religious affiliation). Write with empathy and historical depth.",
  "epitaphSource": "If the epitaph is a quotation from a known source (Bible verse, hymn, poem, literary work), identify it here. Otherwise empty string.",
  "epitaphMeaning": "A sentence or two explaining what the epitaph meant to families of that era and why it was chosen. Empty string if no epitaph."
}`
  );
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Configuration error", details: "API key missing." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildPrompt(body),
        },
      ],
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const rawJson = content.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    const result = JSON.parse(rawJson);

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Narrative generation error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Narrative generation failed", details: errorMessage },
      { status: 500 }
    );
  }
}
