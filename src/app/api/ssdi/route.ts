import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { searchSSdI } from "@/lib/apis/ssdi";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.lastName !== "string" || !body.lastName.trim()) {
      return NextResponse.json({ error: "Invalid or missing 'lastName' input" }, { status: 400 });
    }
    const { firstName, lastName, birthYear, deathYear } = body;
    const ssdi = await searchSSdI(
      typeof firstName === "string" ? firstName : "",
      lastName,
      typeof birthYear === "number" ? birthYear : null,
      typeof deathYear === "number" ? deathYear : null
    );
    return NextResponse.json({ ssdi });
  } catch (error) {
    console.error("[SSDI route] Search failed:", error);
    return NextResponse.json({ ssdi: [], error: "Internal search error" }, { status: 500 });
  }
}
