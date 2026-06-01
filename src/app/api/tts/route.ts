import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";

const ALLOWED_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { text, voice } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    const safeVoice = ALLOWED_VOICES.has(voice) ? voice : "alloy";

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 });
    }

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1-hd",
        input: text.slice(0, 4096), // OpenAI max input length
        voice: safeVoice,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "unknown error");
      console.error("[tts] OpenAI error:", response.status, err);
      return NextResponse.json({ error: "TTS generation failed" }, { status: 502 });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[tts]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
