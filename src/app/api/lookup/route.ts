import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/apiAuth";
import { searchNewspapers, searchLocalAreaNews } from "@/lib/apis/chronicling";
import { searchNaraRecords } from "@/lib/apis/nara";
import { searchLandPatents } from "@/lib/apis/blm";
import { getHistoricalContext, searchCemeteryWikipedia } from "@/lib/apis/wikipedia";
import { getCityContext, getDecadeSnapshots } from "@/lib/apis/localHistory";
import { searchNrhpSites } from "@/lib/apis/nrhp";
import { getCountyPopulation } from "@/lib/apis/census";
import { getSanbornMapUrl } from "@/lib/apis/sanborn";
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
import { searchUsGenWebRecords } from "@/lib/apis/usgenweb";

import { getSoundex, variantsFor } from "@/lib/phonetic";
import { buildResearchChecklist } from "@/lib/researchChecklist";
import type { ResearchData, GeoLocation, NaraItemRecord, UsGenWebRecord } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { checkLocalHistoryCache, saveLocalHistoryCache } from "@/lib/community";

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
    const surnameVariants = lastName ? variantsFor(lastName) : [];

    const supabase = await createClient();

    // ── Check local history cache ───────────────────────────────────────────
    let cachedHistory = null;
    if (hasCoords) {
      cachedHistory = await checkLocalHistoryCache(supabase, lat, lng).catch(() => null);
    }

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
      birthYearNotables,
    ] = await Promise.allSettled([
      searchNewspapers(name, deathYear, state),
      searchNaraRecords(name, birthYear, deathYear, militaryTerms || undefined),
      searchLandPatents(lastName, firstName, state),
      getHistoricalContext(birthYear, deathYear, state),
      searchCemeteryWikipedia(cemetery),
      // Cacheable local history inputs: bypassed on cache hit
      !cachedHistory ? getCityContext(city, county, state) : Promise.resolve({}),
      !cachedHistory ? getDecadeSnapshots(state, birthYear, deathYear) : Promise.resolve([]),
      !cachedHistory ? searchLocalAreaNews(city, county, state, birthYear, deathYear) : Promise.resolve([]),
      (!cachedHistory && hasCoords) ? searchNrhpSites(lat, lng, birthYear, deathYear) : Promise.resolve([]),
      (!cachedHistory && hasCoords) ? getCountyPopulation(lat, lng, birthYear, deathYear) : Promise.resolve([]),
      !cachedHistory ? getSanbornMapUrl(city, state, deathYear) : Promise.resolve(undefined),
      (!cachedHistory && hasCoords) ? getLocalWikidataEvents(lat, lng, birthYear, deathYear) : Promise.resolve([]),
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
      // Notable people born the same year
      birthYear ? getBirthYearNotables(birthYear) : Promise.resolve([]),
    ]);

    // ── Tier 2: Military context (local, instant) ───────────────────────────
    let militaryContext = null;
    if (isMilitary) {
      militaryContext = await getMilitaryContext({
        name, birthYear, deathYear, inscription, symbols,
      });
    }

    // ── Resolve cacheable local history ─────────────────────────────────────
    let localHistory: any = {};
    if (cachedHistory) {
      localHistory = cachedHistory.localHistory || {};
    } else {
      const cityCtx      = cityContext.status      === "fulfilled" ? (cityContext.value as any)      : {};
      const snapshots    = decadeSnapshots.status  === "fulfilled" ? (decadeSnapshots.value as any)  : [];
      const localNews    = localNewspaper.status   === "fulfilled" ? (localNewspaper.value as any)   : [];
      const nrhp         = nrhpSites.status        === "fulfilled" ? (nrhpSites.value as any)        : [];
      const census       = censusPopulation.status === "fulfilled" ? (censusPopulation.value as any) : [];
      const sanborn      = sanbornMapUrl.status    === "fulfilled" ? (sanbornMapUrl.value as any)    : undefined;
      const wikiEvents   = wikidataEvents.status   === "fulfilled" ? (wikidataEvents.value as any)   : [];

      localHistory = {
        ...(cityCtx.cityArticle   ? { cityArticle:   cityCtx.cityArticle   } : {}),
        ...(cityCtx.countyArticle ? { countyArticle: cityCtx.countyArticle } : {}),
        ...(snapshots.length   > 0 ? { decadeSnapshots: snapshots   } : {}),
        ...(localNews.length   > 0 ? { localNewspaper:  localNews   } : {}),
        ...(nrhp.length        > 0 ? { nrhpSites:       nrhp        } : {}),
        ...(census.length      > 0 ? { censusPopulation: census     } : {}),
        ...(sanborn               ? { sanbornMapUrl:    sanborn     } : {}),
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

    // ── Tier 3: Conditional lookups requiring Tier 1/2 results ─────────────
    const landCount = (landRecords.status === "fulfilled" ? (landRecords.value as any) : []).length;
    const [enlistmentResult, usGenWebResult] = await Promise.allSettled([
      // F6: Item-level military records
      militaryContext?.likelyConflict
        ? searchEnlistmentRecords(firstName, lastName, birthYear, militaryContext.likelyConflict)
        : Promise.resolve([] as NaraItemRecord[]),
      // F7: USGenWeb probate/deed/will — only for pre-1920 deaths with known land records
      landCount > 0 && deathYear && deathYear < 1920 && county && state
        ? searchUsGenWebRecords(county, state, deathYear)
        : Promise.resolve([] as UsGenWebRecord[]),
    ]);
    const naraItemRecords = enlistmentResult.status === "fulfilled" ? enlistmentResult.value : [];
    const usGenWebRecords = usGenWebResult.status   === "fulfilled" ? usGenWebResult.value  : [];

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

    const notables = birthYearNotables.status === "fulfilled" ? birthYearNotables.value : [];

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
      usGenWebRecords:    usGenWebRecords.length > 0 ? usGenWebRecords : undefined,
      birthYearNotables:  notables.length        > 0 ? notables        : undefined,
      researchChecklist,
      surnameSoundex:     surnameSoundex || undefined,
      surnameVariants:    surnameVariants.length > 0 ? surnameVariants : undefined,
    });
  } catch (error) {
    console.error("Lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}


