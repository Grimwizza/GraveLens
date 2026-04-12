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
import { searchFamilySearchHints } from "@/lib/apis/familysearch";
import { searchSSdI } from "@/lib/apis/ssdi";
import { searchImmigrationRecords, isLikelyImmigrant } from "@/lib/apis/immigration";
import { searchHistoricalCensus } from "@/lib/apis/historicalCensus";

import { getSoundex } from "@/lib/phonetic";
import { buildResearchChecklist } from "@/lib/researchChecklist";
import type { ResearchData, GeoLocation } from "@/types";

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

    // ── Immigration gate ──────────────────────────────────────────────────
    // Only query passenger collections when inscription or birth year suggests
    // a non-US-born subject, to avoid burning FamilySearch quota unnecessarily.
    const runImmigration = isLikelyImmigrant(inscription, undefined, birthYear, undefined);

    // ── Phonetic normalization ──────────────────────────────────────────────
    const surnameSoundex = lastName ? getSoundex(lastName) : "";

    // ── Immigration gate ────────────────────────────────────────────────────
    // Only search passenger/immigration collections when the available data
    // suggests a non-US-born subject. This avoids burning FamilySearch quota
    // on searches that have near-zero chance of returning useful results.
    const runImmigration = isLikelyImmigrant(inscription, undefined, birthYear, undefined);

    // ── Tier 1: All free-API lookups in parallel ────────────────────────────
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
      familySearchHints,
      ssdiRecords,
      immigrationRecords,
      historicalCensusRecords,
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
      // F1: FamilySearch record hints
      searchFamilySearchHints(firstName, lastName, birthYear, deathYear),
      // F3: SSDI — only 1936–2014 deaths
      searchSSdI(firstName, lastName, birthYear, deathYear),
      // F5: Immigration passenger records — gated
      runImmigration
        ? searchImmigrationRecords(firstName, lastName, birthYear, deathYear)
        : Promise.resolve([]),
      // F4: Historical census — only for pre-1943 deaths
      (!deathYear || deathYear <= 1943)
        ? searchHistoricalCensus(firstName, lastName, birthYear, deathYear, state)
        : Promise.resolve([]),
    ]);

    // ── Tier 2: Military context (local, instant) ───────────────────────────
    let militaryContext = null;
    if (isMilitary) {
      militaryContext = await getMilitaryContext({
        name, birthYear, deathYear, inscription, symbols,
      });
    }

    // ── Resolve parallel results ────────────────────────────────────────────
    const cityCtx      = cityContext.status      === "fulfilled" ? cityContext.value      : {};
    const snapshots    = decadeSnapshots.status  === "fulfilled" ? decadeSnapshots.value  : [];
    const localNews    = localNewspaper.status   === "fulfilled" ? localNewspaper.value   : [];
    const nrhp         = nrhpSites.status        === "fulfilled" ? nrhpSites.value        : [];
    const census       = censusPopulation.status === "fulfilled" ? censusPopulation.value : [];
    const sanborn      = sanbornMapUrl.status    === "fulfilled" ? sanbornMapUrl.value    : undefined;
    const wikiEvents   = wikidataEvents.status   === "fulfilled" ? wikidataEvents.value   : [];
    const fsHints      = familySearchHints.status === "fulfilled" ? familySearchHints.value : [];
    const ssdi         = ssdiRecords.status      === "fulfilled" ? ssdiRecords.value      : [];
    const immigration  = immigrationRecords.status === "fulfilled" ? immigrationRecords.value : [];
    const histCensus   = historicalCensusRecords.status === "fulfilled" ? historicalCensusRecords.value : [];

    const localHistory = {
      ...(cityCtx.cityArticle   ? { cityArticle:   cityCtx.cityArticle   } : {}),
      ...(cityCtx.countyArticle ? { countyArticle: cityCtx.countyArticle } : {}),
      ...(snapshots.length   > 0 ? { decadeSnapshots: snapshots   } : {}),
      ...(localNews.length   > 0 ? { localNewspaper:  localNews   } : {}),
      ...(nrhp.length        > 0 ? { nrhpSites:       nrhp        } : {}),
      ...(census.length      > 0 ? { censusPopulation: census     } : {}),
      ...(sanborn               ? { sanbornMapUrl:    sanborn     } : {}),
      ...(wikiEvents.length  > 0 ? { wikidataEvents:  wikiEvents  } : {}),
    };

    // ── F8: Research Checklist — deterministic, zero-cost ──────────────────
    const partialResearch: ResearchData = {
      newspapers:       newspapers.status    === "fulfilled" ? newspapers.value    : [],
      naraRecords:      naraRecords.status   === "fulfilled" ? naraRecords.value   : [],
      landRecords:      landRecords.status   === "fulfilled" ? landRecords.value   : [],
      militaryContext:  militaryContext ?? undefined,
      familySearchHints: fsHints.length > 0 ? fsHints : undefined,
      ssdi:             ssdi.length     > 0 ? ssdi     : undefined,
      immigration:      immigration.length > 0 ? immigration : undefined,
      historicalCensus: histCensus.length > 0 ? histCensus : undefined,
    };
    const partialLocation: GeoLocation = { lat: lat ?? 0, lng: lng ?? 0, city, county, state };
    const researchChecklist = buildResearchChecklist(
      { name, firstName, lastName, birthYear, deathYear, inscription, symbols } as Parameters<typeof buildResearchChecklist>[0],
      partialResearch,
      partialLocation
    );

    return NextResponse.json({
      newspapers:         newspapers.status    === "fulfilled" ? newspapers.value    : [],
      naraRecords:        naraRecords.status   === "fulfilled" ? naraRecords.value   : [],
      landRecords:        landRecords.status   === "fulfilled" ? landRecords.value   : [],
      historical:         historical.status    === "fulfilled" ? historical.value    : {},
      cemeteryWikiUrl:    cemeteryWikiUrl.status === "fulfilled" ? cemeteryWikiUrl.value : undefined,
      militaryContext,
      localHistory:       Object.keys(localHistory).length > 0 ? localHistory : undefined,
      familySearchHints:  fsHints.length    > 0 ? fsHints    : undefined,
      ssdi:               ssdi.length       > 0 ? ssdi       : undefined,
      immigration:        immigration.length > 0 ? immigration : undefined,
      historicalCensus:   histCensus.length > 0 ? histCensus : undefined,
      researchChecklist,
      surnameSoundex:     surnameSoundex || undefined,
    });
  } catch (error) {
    console.error("Lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}

