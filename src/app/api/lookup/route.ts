import { NextRequest, NextResponse } from "next/server";
import { searchNewspapers } from "@/lib/apis/chronicling";
import { searchNaraRecords } from "@/lib/apis/nara";
import { searchLandPatents } from "@/lib/apis/blm";
import { getHistoricalContext, searchCemeteryWikipedia } from "@/lib/apis/wikipedia";

export async function POST(req: NextRequest) {
  try {
    const { name, firstName, lastName, birthYear, deathYear, state, cemetery } =
      await req.json();

    // Run all lookups in parallel for speed
    const [newspapers, naraRecords, landRecords, historical, cemeteryWikiUrl] =
      await Promise.allSettled([
        searchNewspapers(name, deathYear, state),
        searchNaraRecords(name, birthYear, deathYear),
        searchLandPatents(lastName, firstName, state),
        getHistoricalContext(birthYear, deathYear),
        searchCemeteryWikipedia(cemetery),
      ]);

    return NextResponse.json({
      newspapers:
        newspapers.status === "fulfilled" ? newspapers.value : [],
      naraRecords:
        naraRecords.status === "fulfilled" ? naraRecords.value : [],
      landRecords:
        landRecords.status === "fulfilled" ? landRecords.value : [],
      historical:
        historical.status === "fulfilled" ? historical.value : {},
      cemeteryWikiUrl:
        cemeteryWikiUrl.status === "fulfilled"
          ? cemeteryWikiUrl.value
          : undefined,
    });
  } catch (error) {
    console.error("Lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
