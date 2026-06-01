import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { searchNaraRecords } from "@/lib/apis/nara";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { name, birthYear, deathYear } = await req.json();
    const naraRecords = await searchNaraRecords(name, birthYear ?? null, deathYear ?? null);
    return NextResponse.json({ naraRecords });
  } catch {
    return NextResponse.json({ naraRecords: [] });
  }
}
