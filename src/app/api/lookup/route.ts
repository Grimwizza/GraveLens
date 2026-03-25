import { NextRequest, NextResponse } from "next/server";
import { searchNewspapers } from "@/lib/apis/chronicling";
import { searchNaraRecords } from "@/lib/apis/nara";
import { searchLandPatents } from "@/lib/apis/blm";
import { getHistoricalContext, searchCemeteryWikipedia } from "@/lib/apis/wikipedia";
import {
  hasMilitaryIndicators,
  extractMilitaryTerms,
  getMilitaryContext,
} from "@/lib/apis/military";

export async function POST(req: NextRequest) {
  try {
    const {
      name, firstName, lastName,
      birthYear, deathYear, state, cemetery,
      inscription = "",
      symbols = [],
    } = await req.json();

    // Detect military content on the marker so we can enrich the NARA search
    // and trigger contextual military history generation.
    const isMilitary = hasMilitaryIndicators(inscription, symbols);
    const militaryTerms = isMilitary ? extractMilitaryTerms(inscription, symbols) : "";

    // Run free-API lookups in parallel
    const [newspapers, naraRecords, landRecords, historical, cemeteryWikiUrl] =
      await Promise.allSettled([
        searchNewspapers(name, deathYear, state),
        searchNaraRecords(name, birthYear, deathYear, militaryTerms || undefined),
        searchLandPatents(lastName, firstName, state),
        getHistoricalContext(birthYear, deathYear, state),
        searchCemeteryWikipedia(cemetery),
      ]);

    // Military context: only call Claude when the marker has military language.
    // Falls back to date-inferred basic context if Claude fails.
    let militaryContext = null;
    if (isMilitary) {
      militaryContext = await getMilitaryContext({
        name,
        birthYear,
        deathYear,
        inscription,
        symbols,
      });
    }

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
        cemeteryWikiUrl.status === "fulfilled" ? cemeteryWikiUrl.value : undefined,
      militaryContext,
    });
  } catch (error) {
    console.error("Lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
