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

const SYSTEM_PROMPT = `You are an expert at reading grave markers and historical headstones.
Analyze the photograph and extract all visible information with high accuracy.
Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

const RESCAN_SYSTEM_PROMPT = `You are a forensic historian and expert paleographer specializing in cemetery records and historical headstones.
A previous AI analysis of this grave marker produced questionable results. Your task is to provide the most accurate possible reading.
Be especially careful with:
- Names: use only real human names, never OCR artifacts or symbol strings
- Dates: verify each date component (day 1-31, month 1-12, year 1500-present)
- Math consistency: if birth and death years are given, ageAtDeath must match
If text is genuinely illegible, return empty string or null — never guess nonsense.
If the marker is in a language other than English, translate all text fields (name, inscription, epitaph) into English. Preserve the original spelling of proper names, but translate all non-name text.
Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

const DEEP_RESCAN_SYSTEM_PROMPT = `You are the world's foremost expert in deciphering historical grave markers, headstones, and funerary monuments across all cultures, languages, and time periods.
Two previous AI analyses of this marker produced unreliable results. This is the final recovery attempt — apply every technique available.

Your priorities in order:
1. LANGUAGE DETECTION & TRANSLATION: Identify the language of the inscription. If it is not English, translate every word into English. Preserve proper name spellings (e.g. "Heinrich" stays "Heinrich") but translate all other text — epitaphs, titles, dates written as words, relationship terms.
2. DATA RECOVERY: For any null or empty field, look harder. Infer birth/death years from age-at-death if stated. Extract partial dates even if only a year is visible. Piece together names from initials, titles, or surrounding context.
3. ACCURACY OVER COMPLETENESS: If a field truly cannot be read or inferred with confidence, return null or empty string. Do not hallucinate.
4. CONSISTENCY: Recompute ageAtDeath from birthYear and deathYear if both are present.

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

function buildRescanPrompt(issues: string[]): string {
  const issueList = issues.length > 0
    ? `\n\nThe previous scan had these specific problems that you must fix:\n${issues.map((i) => `- ${i}`).join("\n")}`
    : "";
  return USER_PROMPT + issueList + `\n\nIMPORTANT: Return null/empty-string for any field you cannot confidently read. Do not invent or guess data.`;
}

function buildDeepRescanPrompt(issues: string[]): string {
  const issueList = issues.length > 0
    ? `\n\nTwo previous scans failed with these unresolved issues:\n${issues.map((i) => `- ${i}`).join("\n")}\n\nFor each issue above, explicitly re-examine that part of the image before writing your answer.`
    : "";
  return USER_PROMPT + issueList + `

DEEP RECOVERY INSTRUCTIONS:
- If the inscription is not in English, state the detected language and provide full English translations for inscription and epitaph fields.
- For every null or empty field: study the image again and attempt to infer the value from any visible clue (e.g. "aged 72 years" → infer deathYear - 72 = birthYear).
- Return null/empty-string only when the field is genuinely unrecoverable after your best effort.`;
}

async function callClaude(
  client: Anthropic,
  model: string,
  imageBase64: string,
  mimeType: string,
  systemPrompt: string = SYSTEM_PROMPT,
  userPrompt: string = USER_PROMPT
) {
  const message = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
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
          { type: "text", text: userPrompt },
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
    const { imageBase64, mimeType, rescan, deep, issues } = await req.json();
    if (!imageBase64) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const validMime = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const finalMime = validMime.includes(mimeType) ? mimeType : "image/jpeg";
    const client = new Anthropic({ apiKey });

    // ── Deep rescan mode: maximum-effort recovery with translation focus ──────
    if (rescan && deep) {
      console.log("[Analyze] Deep rescan mode — using Sonnet with full recovery prompt");
      const issueMessages: string[] = Array.isArray(issues) ? issues : [];
      const extracted = await callClaude(
        client,
        MODEL_SONNET,
        imageBase64,
        finalMime,
        DEEP_RESCAN_SYSTEM_PROMPT,
        buildDeepRescanPrompt(issueMessages)
      );
      extracted.source = "claude";
      extracted.analysisModel = MODEL_SONNET;
      extracted.isRescan = true;
      extracted.isDeepRescan = true;
      return NextResponse.json({ extracted, _model: MODEL_SONNET });
    }

    // ── Rescan mode: always uses Sonnet with sharpened forensic prompt ────────
    if (rescan) {
      console.log("[Analyze] Rescan mode — using Sonnet with forensic prompt");
      const issueMessages: string[] = Array.isArray(issues) ? issues : [];
      const extracted = await callClaude(
        client,
        MODEL_SONNET,
        imageBase64,
        finalMime,
        RESCAN_SYSTEM_PROMPT,
        buildRescanPrompt(issueMessages)
      );
      extracted.source = "claude";
      extracted.analysisModel = MODEL_SONNET;
      extracted.isRescan = true;
      return NextResponse.json({ extracted, _model: MODEL_SONNET });
    }

    // ── Tier 1: Haiku ────────────────────────────────────────────────────────
    let extracted: Record<string, unknown> | null = null;
    let usedModel = MODEL_HAIKU;

    try {
      extracted = await callClaude(client, MODEL_HAIKU, imageBase64, finalMime);
    } catch (err) {
      console.warn("[Analyze] Haiku failed, escalating to Sonnet:", err);
    }

    // ── Tier 2: Escalate to Sonnet if Haiku returned low confidence or failed ─
    const needsEscalation =
      !extracted || extracted.confidence === "low";

    if (needsEscalation) {
      usedModel = MODEL_SONNET;
      console.log("[Analyze] Escalating to Sonnet — Haiku confidence:", extracted?.confidence ?? "failed");
      extracted = await callClaude(client, MODEL_SONNET, imageBase64, finalMime);
      console.log("[Analyze] Sonnet returned confidence:", extracted?.confidence);
    }

    extracted!.source = "claude";
    extracted!.analysisModel = usedModel;

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
