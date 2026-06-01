import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

// Two-tier model strategy:
//   Haiku   — fast, cheap (~$0.003/scan). Used on every request.
//   Sonnet  — slower, better (~$0.010/scan). Only used when Haiku returns
//             low confidence or produces unparseable JSON.
// Net result: ~72% cost reduction on clear markers, full quality on difficult ones.
const MODEL_HAIKU = "claude-haiku-4-5-20251001";
const MODEL_SONNET = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

function toNameCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
}

function normalizeExtractedNames(obj: Record<string, unknown>): void {
  if (typeof obj.name === "string") obj.name = toNameCase(obj.name);
  if (typeof obj.firstName === "string") obj.firstName = toNameCase(obj.firstName);
  if (typeof obj.lastName === "string") obj.lastName = toNameCase(obj.lastName);
  if (Array.isArray(obj.people)) {
    for (const p of obj.people as Record<string, unknown>[]) {
      if (typeof p.name === "string") p.name = toNameCase(p.name);
      if (typeof p.firstName === "string") p.firstName = toNameCase(p.firstName);
      if (typeof p.lastName === "string") p.lastName = toNameCase(p.lastName);
    }
  }
}

const SYSTEM_PROMPT = `You are an expert at reading grave markers and historical headstones.
Analyze the photograph and extract all visible information with high accuracy.
Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

const USER_PROMPT = `Analyze this grave marker photograph and extract all information. Return JSON with exactly these fields:

{
  "name": "full name as inscribed (primary or only person)",
  "firstName": "first name only (primary or only person)",
  "lastName": "last name only (primary or only person)",
  "birthDate": "full birth date as inscribed, or empty string (primary or only person)",
  "birthYear": null or integer year (primary or only person),
  "deathDate": "full death date as inscribed, or empty string (primary or only person)",
  "deathYear": null or integer year (primary or only person),
  "ageAtDeath": null or integer (primary or only person; calculate from dates if not explicitly stated),
  "people": [
    {
      "name": "full name as inscribed",
      "firstName": "first name only",
      "lastName": "last name only",
      "birthDate": "full birth date as inscribed, or empty string",
      "birthYear": null or integer year,
      "deathDate": "full death date as inscribed, or empty string",
      "deathYear": null or integer year,
      "ageAtDeath": null or integer
    }
  ],
  "inscription": "complete verbatim transcription of ALL text visible on the marker",
  "epitaph": "any epitaph, verse, or sentiment inscribed (separate from dates/name)",
  "symbols": ["array of described symbols: religious, military, fraternal, decorative"],
  "markerType": "headstone | obelisk | ledger | cross | flat marker | monument | other",
  "material": "granite | marble | limestone | sandstone | concrete | metal | other",
  "condition": "excellent | good | weathered | damaged | illegible",
  "confidence": "high | medium | low"
}

Rules:
- If a field is not visible or determinable, use null for numbers and empty string for strings.
- For symbols, describe each one specifically (e.g., "Masonic square and compass", "lamb — symbol of innocence", "U.S. Army emblem", "IHS Christogram").
- Calculate ageAtDeath if birth and death years are both present.
- If text is partially obscured, include what is legible with [?] for uncertain characters.
- If the marker is in a language other than English, translate all text fields (name, inscription, epitaph) into English. Preserve the original spelling of proper names (e.g. "Johann" stays "Johann"), but translate all non-name text.
- The "people" array must contain one entry per distinct person commemorated on the marker. If only one person is commemorated, "people" contains just that one entry (identical to the top-level name/date fields). Only include a person in "people" if they have a distinct name AND at least one date (birth or death). The top-level name/firstName/lastName/birthDate/birthYear/deathDate/deathYear/ageAtDeath must always reflect the primary (or only) person.`;

async function callClaude(
  client: Anthropic,
  model: string,
  imageBase64: string,
  mimeType: string,
) {
  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: imageBase64,
            },
          },
          { type: "text", text: USER_PROMPT },
        ],
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const rawJson = content.text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  return JSON.parse(rawJson);
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
    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const validMime = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const finalMime = validMime.includes(mimeType) ? mimeType : "image/jpeg";
    const client = new Anthropic({ apiKey });

    // ── Tier 1: Haiku ────────────────────────────────────────────────────────
    let extracted: Record<string, unknown> | null = null;
    let usedModel = MODEL_HAIKU;

    try {
      extracted = await callClaude(client, MODEL_HAIKU, imageBase64, finalMime);
    } catch (err) {
      console.warn("[Analyze] Haiku failed, escalating to Sonnet:", err);
    }

    // ── Tier 2: Escalate to Sonnet if Haiku returned low confidence or failed ─
    const needsEscalation = !extracted || extracted.confidence === "low";

    if (needsEscalation) {
      usedModel = MODEL_SONNET;
      console.log("[Analyze] Escalating to Sonnet — Haiku confidence:", extracted?.confidence ?? "failed");
      extracted = await callClaude(client, MODEL_SONNET, imageBase64, finalMime);
      console.log("[Analyze] Sonnet returned confidence:", extracted?.confidence);
    }

    extracted!.source = "claude";
    extracted!.analysisModel = usedModel;
    normalizeExtractedNames(extracted!);

    return NextResponse.json({ extracted, _model: usedModel });
  } catch (error: unknown) {
    console.error("Claude analysis error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStatus = (error as { status?: number })?.status || 500;
    return NextResponse.json(
      { error: "Analysis failed", details: errorMessage },
      { status: errorStatus }
    );
  }
}
