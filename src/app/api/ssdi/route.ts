import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { searchSSdI } from "@/lib/apis/ssdi";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { firstName, lastName, birthYear, deathYear } = await req.json();
    const ssdi = await searchSSdI(firstName, lastName, birthYear ?? null, deathYear ?? null);
    return NextResponse.json({ ssdi });
  } catch {
    return NextResponse.json({ ssdi: [] });
  }
}
