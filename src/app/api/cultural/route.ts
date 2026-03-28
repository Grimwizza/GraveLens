import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

// Haiku is ideal here — rich descriptive prose at low cost.
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are a historical lifestyle researcher for a genealogy app. Your role
is to paint vivid, accurate pictures of daily life in different eras and places — helping
modern people truly feel what it was like to be alive when their ancestors were.

Rules:
- Be specific: name actual technologies, songs, films, events, prices, brands, places
- Geography matters enormously — rural Iowa and urban Chicago in 1900 were different worlds
- Focus on the arc of change: what shifted dramatically across the person's lifetime
- Write about the era and place, never fabricate specifics about the individual
- Make the past tangible and human — the goal is emotional connection, not encyclopaedia entries
- Return ONLY valid JSON — no markdown fences, no preamble, no explanation`;

// ── Category definitions (shared with client) ─────────────────────────────

export const CATEGORY_DEFS = [
  { id: "popculture",    label: "Pop Culture",        icon: "🎵" },
  { id: "transport",     label: "Getting Around",     icon: "🚂" },
  { id: "homelife",      label: "Home & Daily Life",  icon: "🏡" },
  { id: "health",        label: "Health & Medicine",  icon: "🩺" },
  { id: "communication", label: "News & Communication", icon: "📻" },
];

// ── Prompt builders ───────────────────────────────────────────────────────

function personContext(params: {
  name: string;
  birthYear: number | null;
  deathYear: number | null;
  ageAtDeath: number | null;
  city?: string;
  state?: string;
}): string {
  const lines: string[] = [];
  lines.push(`Name: ${params.name || "Unknown"}`);
  if (params.birthYear) lines.push(`Born: ${params.birthYear}`);
  if (params.deathYear) lines.push(`Died: ${params.deathYear}`);
  if (params.ageAtDeath) lines.push(`Age at death: ${params.ageAtDeath}`);
  if (params.city || params.state) {
    lines.push(`Location: ${[params.city, params.state].filter(Boolean).join(", ")}`);
  }
  return lines.join("\n");
}

function summaryPrompt(params: Parameters<typeof personContext>[0]): string {
  return `${personContext(params)}

For each of the 5 categories below, write exactly 2 vivid sentences capturing the most
striking aspect of this person's lifetime experience in that domain. Lead with the most
surprising or tangible detail. Emphasise the arc of change — what they were born into
versus what they witnessed before they died.

Categories:
- "popculture":    Music, film, radio, theatre, and entertainment they would have experienced
- "transport":     How people moved around in their region; how the size of their world changed
- "homelife":      Daily home technology, food, housing; what changed from birth to death
- "health":        Medical care available, common diseases, health milestones of their era
- "communication": How news travelled; telegraph/telephone/radio adoption; how connected they were

Return ONLY this JSON (no other text):
{
  "categories": [
    { "id": "popculture",    "summary": "..." },
    { "id": "transport",     "summary": "..." },
    { "id": "homelife",      "summary": "..." },
    { "id": "health",        "summary": "..." },
    { "id": "communication", "summary": "..." }
  ]
}`;
}

function expandPrompt(
  params: Parameters<typeof personContext>[0],
  categoryId: string,
  categoryLabel: string
): string {
  return `${personContext(params)}
Category: ${categoryLabel}

Write 4 paragraphs walking through this person's lifetime experience with ${categoryLabel},
moving chronologically from their early years to the end of their life.

Be richly specific — name actual songs, technologies, what things cost, real events, local
places. Use their geography (${params.state ?? "their region"}) to ground it locally where
you can. Show how dramatically things changed across a single lifetime.

The person reading this is standing at this grave. Make them feel what that life actually
looked and sounded and smelled like. Make the past real and human.

Return ONLY this JSON (no other text):
{ "detail": "paragraph one\\n\\nparagraph two\\n\\nparagraph three\\n\\nparagraph four" }`;
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key missing." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { mode, categoryId, categoryLabel, ...person } = body;

    const prompt =
      mode === "expand"
        ? expandPrompt(person, categoryId, categoryLabel)
        : summaryPrompt(person);

    const maxTokens = mode === "expand" ? 1500 : 900;

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    const raw = content.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    console.error("[/api/cultural]", err);
    return NextResponse.json(
      { error: "Cultural context generation failed", details: String(err) },
      { status: 500 }
    );
  }
}
