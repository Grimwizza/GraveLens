import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { searchFamilySearchHints } from "@/lib/apis/familysearch";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { firstName, lastName, birthYear, deathYear } = await req.json();
    const familySearchHints = await searchFamilySearchHints(firstName, lastName, birthYear ?? null, deathYear ?? null);
    return NextResponse.json({ familySearchHints });
  } catch {
    return NextResponse.json({ familySearchHints: [] });
  }
}
