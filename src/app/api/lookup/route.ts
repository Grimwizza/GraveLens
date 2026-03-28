import { NextRequest, NextResponse } from "next/server";
import { searchNewspapers, searchLocalAreaNews } from "@/lib/apis/chronicling";
import { searchNaraRecords } from "@/lib/apis/nara";
import { searchLandPatents } from "@/lib/apis/blm";
import { getHistoricalContext, searchCemeteryWikipedia } from "@/lib/apis/wikipedia";
import { getCityContext, getDecadeSnapshots } from "@/lib/apis/localHistory";
import { searchNrhpSites } from "@/lib/apis/nrhp";
import { getCountyPopulation } from "@/lib/apis/census";
import { getSanbornMapUrl } from "@/lib/apis/sanborn";
import { getLocalWikidataEvents } from "@/lib/apis/wikidata";
import {
  hasMilitaryIndicators,
  extractMilitaryTerms,
  getMilitaryContext,
} from "@/lib/apis/military";

export async function POST(req: NextRequest) {
  try {
    const {
      name, firstName, lastName,
      birthYear, deathYear,
      lat, lng,
      city, county, state, cemetery,
      inscription = "",
      symbols = [],
    } = await req.json();

    const hasCoords = typeof lat === "number" && typeof lng === "number" && (lat !== 0 || lng !== 0);

    const isMilitary = hasMilitaryIndicators(inscription, symbols);
    const militaryTerms = isMilitary ? extractMilitaryTerms(inscription, symbols) : "";

    // ── Tier 1: Run all free-API lookups in parallel ────────────────────────
    const [
      newspapers,
      naraRecords,
      landRecords,
      historical,
      cemeteryWikiUrl,
      cityContext,
      decadeSnapshots,
      localNewspaper,
      nrhpSites,
      censusPopulation,
      sanbornMapUrl,
      wikidataEvents,
    ] = await Promise.allSettled([
      searchNewspapers(name, deathYear, state),
      searchNaraRecords(name, birthYear, deathYear, militaryTerms || undefined),
      searchLandPatents(lastName, firstName, state),
      getHistoricalContext(birthYear, deathYear, state),
      searchCemeteryWikipedia(cemetery),
      getCityContext(city, county, state),
      getDecadeSnapshots(state, birthYear, deathYear),
      searchLocalAreaNews(city, county, state, birthYear, deathYear),
      hasCoords ? searchNrhpSites(lat, lng, birthYear, deathYear) : Promise.resolve([]),
      hasCoords ? getCountyPopulation(lat, lng, birthYear, deathYear) : Promise.resolve([]),
      getSanbornMapUrl(city, state, deathYear),
      hasCoords ? getLocalWikidataEvents(lat, lng, birthYear, deathYear) : Promise.resolve([]),
    ]);

    // ── Tier 2: Military context (local, instant) ───────────────────────────
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

    // ── Assemble local history context ──────────────────────────────────────
    const cityCtx = cityContext.status === "fulfilled" ? cityContext.value : {};
    const snapshots = decadeSnapshots.status === "fulfilled" ? decadeSnapshots.value : [];
    const localNews = localNewspaper.status === "fulfilled" ? localNewspaper.value : [];
    const nrhp = nrhpSites.status === "fulfilled" ? nrhpSites.value : [];
    const census = censusPopulation.status === "fulfilled" ? censusPopulation.value : [];
    const sanborn = sanbornMapUrl.status === "fulfilled" ? sanbornMapUrl.value : undefined;
    const wikiEvents = wikidataEvents.status === "fulfilled" ? wikidataEvents.value : [];

    const localHistory = {
      ...(cityCtx.cityArticle ? { cityArticle: cityCtx.cityArticle } : {}),
      ...(cityCtx.countyArticle ? { countyArticle: cityCtx.countyArticle } : {}),
      ...(snapshots.length > 0 ? { decadeSnapshots: snapshots } : {}),
      ...(localNews.length > 0 ? { localNewspaper: localNews } : {}),
      ...(nrhp.length > 0 ? { nrhpSites: nrhp } : {}),
      ...(census.length > 0 ? { censusPopulation: census } : {}),
      ...(sanborn ? { sanbornMapUrl: sanborn } : {}),
      ...(wikiEvents.length > 0 ? { wikidataEvents: wikiEvents } : {}),
    };

    return NextResponse.json({
      newspapers:    newspapers.status    === "fulfilled" ? newspapers.value    : [],
      naraRecords:   naraRecords.status   === "fulfilled" ? naraRecords.value   : [],
      landRecords:   landRecords.status   === "fulfilled" ? landRecords.value   : [],
      historical:    historical.status    === "fulfilled" ? historical.value    : {},
      cemeteryWikiUrl: cemeteryWikiUrl.status === "fulfilled" ? cemeteryWikiUrl.value : undefined,
      militaryContext,
      localHistory: Object.keys(localHistory).length > 0 ? localHistory : undefined,
    });
  } catch (error) {
    console.error("Lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
