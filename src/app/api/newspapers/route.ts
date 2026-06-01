import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { searchNewspapers } from "@/lib/apis/chronicling";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { name, deathYear, state } = await req.json();
    const newspapers = await searchNewspapers(name, deathYear ?? null, state);
    return NextResponse.json({ newspapers });
  } catch {
    return NextResponse.json({ newspapers: [] });
  }
}
