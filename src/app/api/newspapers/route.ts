import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { searchNewspapers } from "@/lib/apis/chronicling";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Invalid or missing 'name' input" }, { status: 400 });
    }
    const { name, deathYear, state } = body;
    const newspapers = await searchNewspapers(
      name,
      typeof deathYear === "number" ? deathYear : null,
      typeof state === "string" ? state : undefined
    );
    return NextResponse.json({ newspapers });
  } catch (error) {
    console.error("[Newspapers route] Search failed:", error);
    return NextResponse.json({ newspapers: [], error: "Internal search error" }, { status: 500 });
  }
}
