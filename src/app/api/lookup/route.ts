import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { searchNewspapers, searchLocalAreaNews } from "@/lib/apis/chronicling";
import { searchNaraRecords } from "@/lib/apis/nara";
import { searchLandPatents } from "@/lib/apis/blm";
import { getHistoricalContext, searchCemeteryWikipedia } from "@/lib/apis/wikipedia";
import { getCityContext, getDecadeSnapshots } from "@/lib/apis/localHistory";
import { searchNrhpSites } from "@/lib/apis/nrhp";
import { getCountyPopulation } from "@/lib/apis/census";
import { getLocalWikidataEvents, getBirthYearNotables } from "@/lib/apis/wikidata";
import {
  hasMilitaryIndicators,
  extractMilitaryTerms,
  getMilitaryContext,
} from "@/lib/apis/military";
import { searchFamilySearchHints } from "@/lib/apis/familysearch";
import { searchSSdI } from "@/lib/apis/ssdi";
import { searchImmigrationRecords, isLikelyImmigrant } from "@/lib/apis/immigration";
import { searchHistoricalCensus } from "@/lib/apis/historicalCensus";
import { searchEnlistmentRecords } from "@/lib/apis/nara";

import { getSoundex, variantsFor } from "@/lib/phonetic";
import { buildResearchChecklist } from "@/lib/researchChecklist";
import { buildAllResearchLinks } from "@/lib/researchLinks";
import type { ResearchData, GeoLocation, NaraItemRecord } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { checkLocalHistoryCache, saveLocalHistoryCache } from "@/lib/community";
import { CURRENT_RESEARCH_VERSION } from "@/lib/researchVersion";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const {
      name, firstName, lastName,
      birthYear, deathYear,
      lat, lng,
      city, county, state, cemetery,
      inscription = "",
      symbols = [],
      supplemental = false,
    } = await req.json();

    const hasCoords = typeof lat === "number" && typeof lng === "number" && (lat !== 0 || lng !== 0);
    const supabase = await createClient();

    // ── Check local history cache ───────────────────────────────────────────
    let cachedHistory = null;
    if (hasCoords) {
      cachedHistory = await checkLocalHistoryCache(supabase, lat, lng).catch(() => null);
    }

    // ── Phase 2: supplemental geographic data + birth year notables ─────────
    // Fired simultaneously with Phase 1 by the frontend. Returns the slow
    // geographic enrichment that would otherwise bottleneck first-content time.
    if (supplemental) {
      let localHistory: any = {};

      if (cachedHistory) {
        // Cache hit — geography is instant, no API calls needed
        localHistory = cachedHistory.localHistory || {};
      } else {
        // Cache miss — run all geographic enrichment calls in parallel
        const [
          cityContext, decadeSnaps, localNewspaper,
          nrhpSites, censusPopulation, wikidataEvents,
        ] = await Promise.allSettled([
          getCityContext(city, county, state),
          getDecadeSnapshots(state, birthYear, deathYear),
          searchLocalAreaNews(city, county, state, birthYear, deathYear),
          hasCoords ? searchNrhpSites(lat, lng, birthYear, deathYear) : Promise.resolve([]),
          (hasCoords && (!deathYear || deathYear >= 1970)) ? getCountyPopulation(lat, lng, birthYear, deathYear) : Promise.resolve([]),
          hasCoords ? getLocalWikidataEvents(lat, lng, birthYear, deathYear) : Promise.resolve([]),
        ]);

        const cityCtx    = cityContext.status      === "fulfilled" ? (cityContext.value as any)      : {};
        const snapshots  = decadeSnaps.status      === "fulfilled" ? (decadeSnaps.value as any)      : [];
        const localNews  = localNewspaper.status   === "fulfilled" ? (localNewspaper.value as any)   : [];
        const nrhp       = nrhpSites.status        === "fulfilled" ? (nrhpSites.value as any)        : [];
        const census     = censusPopulation.status === "fulfilled" ? (censusPopulation.value as any) : [];
        const wikiEvents = wikidataEvents.status   === "fulfilled" ? (wikidataEvents.value as any)   : [];

        localHistory = {
          ...(cityCtx.cityArticle   ? { cityArticle:   cityCtx.cityArticle   } : {}),
          ...(cityCtx.countyArticle ? { countyArticle: cityCtx.countyArticle } : {}),
          ...(snapshots.length   > 0 ? { decadeSnapshots: snapshots   } : {}),
          ...(localNews.length   > 0 ? { localNewspaper:  localNews   } : {}),
          ...(nrhp.length        > 0 ? { nrhpSites:       nrhp        } : {}),
          ...(census.length      > 0 ? { censusPopulation: census     } : {}),
          ...(wikiEvents.length  > 0 ? { wikidataEvents:  wikiEvents  } : {}),
        };

        if (hasCoords) {
          await saveLocalHistoryCache(supabase, lat, lng, {
            localHistory,
            wikidataEvents: wikiEvents,
            nrhpSites: nrhp,
          }).catch((err) => console.error("[local-history-cache-save] failed:", err));
        }
      }

      // birthYearNotables is always person-specific (never geographic-cached)
      const [birthYearNotablesResult] = await Promise.allSettled([
        birthYear ? getBirthYearNotables(birthYear) : Promise.resolve([]),
      ]);
      const notables = birthYearNotablesResult.status === "fulfilled" ? (birthYearNotablesResult.value as any) : [];

      return NextResponse.json({
        localHistory:      Object.keys(localHistory).length > 0 ? localHistory : undefined,
        birthYearNotables: notables.length > 0 ? notables : undefined,
      });
    }

    // ── Phase 1: person-specific lookups ────────────────────────────────────

    const isMilitary = hasMilitaryIndicators(inscription, symbols);
    const militaryTerms = isMilitary ? extractMilitaryTerms(inscription, symbols) : "";
    const runImmigration = isLikelyImmigrant(inscription, undefined, birthYear, undefined);
    const surnameSoundex = lastName ? getSoundex(lastName) : "";
    const surnameVariants = lastName ? variantsFor(lastName) : [];

    const [
      newspapers, naraRecords, landRecords, historical, cemeteryWikiUrl,
      familySearchHints, ssdiRecords, immigrationRecords, historicalCensusRecords,
    ] = await Promise.allSettled([
      searchNewspapers(name, deathYear, state),
      // NARA catalog indexes series/finding aids, not individuals — only useful for military records
      isMilitary
        ? searchNaraRecords(name, birthYear, deathYear, militaryTerms || undefined)
        : Promise.resolve([]),
      // BLM land patents are frontier-era; meaningless for post-1940 urban burials
      (!deathYear || deathYear < 1940)
        ? searchLandPatents(lastName, firstName, state)
        : Promise.resolve([]),
      getHistoricalContext(birthYear, deathYear, state),
      searchCemeteryWikipedia(cemetery),
      // F1: FamilySearch record hints — require at least one date anchor to be actionable
      (birthYear || deathYear)
        ? searchFamilySearchHints(firstName, lastName, birthYear, deathYear)
        : Promise.resolve([]),
      // F3: SSDI — only 1936–2014 deaths
      searchSSdI(firstName, lastName, birthYear, deathYear),
      // F5: Immigration passenger records — gated
      runImmigration
        ? searchImmigrationRecords(firstName, lastName, birthYear, deathYear)
        : Promise.resolve([]),
      // F4: Historical census — 1880–1940 indexed; allow up to 1950
      (!deathYear || deathYear <= 1950)
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

    // ── Tier 3: Conditional lookups requiring Tier 1/2 results ─────────────
    const [enlistmentResult] = await Promise.allSettled([
      militaryContext?.likelyConflict
        ? searchEnlistmentRecords(firstName, lastName, birthYear, militaryContext.likelyConflict)
        : Promise.resolve([] as NaraItemRecord[]),
    ]);
    const naraItemRecords = enlistmentResult.status === "fulfilled" ? enlistmentResult.value : [];

    // On cache hit, include full geographic context in Phase 1 response.
    // On cache miss, localHistory is empty — Phase 2 fetches and caches all geography.
    const localHistory: any = cachedHistory ? (cachedHistory.localHistory || {}) : {};

    // ── F8: Research Checklist — deterministic, zero-cost ──────────────────
    const partialResearch: ResearchData = {
      newspapers:       newspapers.status    === "fulfilled" ? (newspapers.value as any)    : [],
      naraRecords:      naraRecords.status   === "fulfilled" ? (naraRecords.value as any)   : [],
      landRecords:      landRecords.status   === "fulfilled" ? (landRecords.value as any)   : [],
      militaryContext:  militaryContext ?? undefined,
      familySearchHints: familySearchHints.status === "fulfilled" ? (familySearchHints.value as any) : undefined,
      ssdi:             ssdiRecords.status   === "fulfilled" ? (ssdiRecords.value as any)   : undefined,
      immigration:      immigrationRecords.status === "fulfilled" ? (immigrationRecords.value as any) : undefined,
      historicalCensus: historicalCensusRecords.status === "fulfilled" ? (historicalCensusRecords.value as any) : undefined,
    };
    const partialLocation: GeoLocation = { lat: lat ?? 0, lng: lng ?? 0, city, county, state };
    const researchChecklist = buildResearchChecklist(
      { name, firstName, lastName, birthYear, deathYear, inscription, symbols } as Parameters<typeof buildResearchChecklist>[0],
      partialResearch,
      partialLocation
    );

    // ── P3: Research deep-links (zero-cost, computed from existing data) ─────
    const researchLinks = buildAllResearchLinks({
      firstName:      firstName ?? "",
      lastName:       lastName  ?? "",
      birthYear:      birthYear ?? null,
      deathYear:      deathYear ?? null,
      state:          state     ?? "",
      inscription:    inscription,
      symbols:        symbols,
      likelyConflict: militaryContext?.likelyConflict ?? null,
    });

    return NextResponse.json({
      newspapers:         newspapers.status    === "fulfilled" ? newspapers.value    : [],
      naraRecords:        naraRecords.status   === "fulfilled" ? naraRecords.value   : [],
      landRecords:        landRecords.status   === "fulfilled" ? landRecords.value   : [],
      historical:         historical.status    === "fulfilled" ? historical.value    : {},
      cemeteryWikiUrl:    cemeteryWikiUrl.status === "fulfilled" ? cemeteryWikiUrl.value : undefined,
      militaryContext,
      localHistory:       Object.keys(localHistory).length > 0 ? localHistory : undefined,
      familySearchHints:  familySearchHints.status === "fulfilled" && (familySearchHints.value as any).length > 0 ? familySearchHints.value : undefined,
      ssdi:               ssdiRecords.status        === "fulfilled" && (ssdiRecords.value as any).length        > 0 ? ssdiRecords.value        : undefined,
      immigration:        immigrationRecords.status === "fulfilled" && (immigrationRecords.value as any).length > 0 ? immigrationRecords.value : undefined,
      historicalCensus:   historicalCensusRecords.status === "fulfilled" && (historicalCensusRecords.value as any).length > 0 ? historicalCensusRecords.value : undefined,
      naraItemRecords:    naraItemRecords.length > 0 ? naraItemRecords : undefined,
      researchChecklist,
      surnameSoundex:     surnameSoundex || undefined,
      surnameVariants:    surnameVariants.length > 0 ? surnameVariants : undefined,
      researchLinks:      researchLinks.length  > 0 ? researchLinks  : undefined,
      researchVersion:    CURRENT_RESEARCH_VERSION,
    });
  } catch (error) {
    console.error("Lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
