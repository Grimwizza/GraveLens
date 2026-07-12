import { searchSanbornMap } from "@/lib/apis/sanborn";
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
import { searchWikiTree } from "@/lib/apis/wikitree";

import { getSoundex, variantsFor } from "@/lib/phonetic";
import { buildPersonQuery } from "@/lib/research/personQuery";
import { searchUsGenWeb } from "@/lib/apis/usgenweb";
import type { SourceResult } from "@/lib/apis/client";
import { buildResearchChecklist } from "@/lib/researchChecklist";
import { buildAllResearchLinks } from "@/lib/researchLinks";
import type {
  ResearchData, GeoLocation, NaraItemRecord, LocalHistoryContext,
  ResearchSourceStatus, UsGenWebRecord,
} from "@/types";

/** Unwraps a settled SourceResult; a rejected promise counts as a failed source. */
function unwrap<T>(r: PromiseSettledResult<SourceResult<T>>): SourceResult<T> {
  return r.status === "fulfilled" ? r.value : { status: "failed", records: [] };
}

/** Placeholder for sources whose era/context gate didn't fire — not an error. */
const EMPTY_SOURCE: SourceResult<never> = { status: "empty", records: [] };
import { createClient } from "@/lib/supabase/server";
import {
  checkLocalHistoryCache, saveLocalHistoryCache,
  computePersonIdentityKey, checkResearchCache, saveResearchCache,
  upsertBurialIndex,
} from "@/lib/community";
import { CURRENT_RESEARCH_VERSION } from "@/lib/researchVersion";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const {
      name, firstName, lastName,
      birthYear, deathYear,
      birthDate, deathDate,
      people,
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
      let localHistory: LocalHistoryContext = {};

      if (cachedHistory) {
        // Cache hit — geography is instant, no API calls needed
        localHistory = cachedHistory.localHistory || {};
      } else {
        // Cache miss — run all geographic enrichment calls in parallel
        const [
          cityContext, decadeSnaps, localNewspaper,
          nrhpSites, censusPopulation, wikidataEvents,
          sanbornMapResult,
        ] = await Promise.allSettled([
          getCityContext(city, county, state),
          getDecadeSnapshots(state, birthYear, deathYear),
          searchLocalAreaNews(city, county, state, birthYear, deathYear),
          hasCoords ? searchNrhpSites(lat, lng, birthYear, deathYear) : Promise.resolve([]),
          (hasCoords && (!deathYear || deathYear >= 1970)) ? getCountyPopulation(lat, lng, birthYear, deathYear) : Promise.resolve([]),
          hasCoords ? getLocalWikidataEvents(lat, lng, birthYear, deathYear) : Promise.resolve([]),
          searchSanbornMap(city, state, deathYear ?? birthYear),
        ]);

        const cityCtx    = cityContext.status      === "fulfilled" ? cityContext.value      : {};
        const snapshots  = decadeSnaps.status      === "fulfilled" ? decadeSnaps.value      : [];
        const localNews  = localNewspaper.status   === "fulfilled" ? localNewspaper.value   : [];
        const nrhp       = nrhpSites.status        === "fulfilled" ? nrhpSites.value        : [];
        const census     = censusPopulation.status === "fulfilled" ? censusPopulation.value : [];
        const wikiEvents = wikidataEvents.status   === "fulfilled" ? wikidataEvents.value   : [];
        const sanborn    = sanbornMapResult.status === "fulfilled" ? sanbornMapResult.value : null;

        localHistory = {
          ...(cityCtx.cityArticle   ? { cityArticle:   cityCtx.cityArticle   } : {}),
          ...(cityCtx.countyArticle ? { countyArticle: cityCtx.countyArticle } : {}),
          ...(snapshots.length   > 0 ? { decadeSnapshots: snapshots   } : {}),
          ...(localNews.length   > 0 ? { localNewspaper:  localNews   } : {}),
          ...(nrhp.length        > 0 ? { nrhpSites:       nrhp        } : {}),
          ...(census.length      > 0 ? { censusPopulation: census     } : {}),
          ...(wikiEvents.length  > 0 ? { wikidataEvents:  wikiEvents  } : {}),
          ...(sanborn                  ? { sanbornMap:        sanborn      } : {}),
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
      const notables = birthYearNotablesResult.status === "fulfilled" ? birthYearNotablesResult.value : [];

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

    // Identity layer: normalized names (Wm.→William), exact stone dates,
    // GPS-derived place chain — feeds every person-specific search below.
    const pq = buildPersonQuery({
      name, firstName, lastName,
      birthYear, deathYear, birthDate, deathDate,
      inscription, people,
      city, county, state,
    });
    const bestFullName = pq.fullNames[0] ?? name;

    // ── Shared research cache + burial index harvest ────────────────────────
    // Every scan contributes the stone's public facts to the pooled burial
    // index; completed research is cached per person so a repeat scan — by
    // any user — returns instantly with zero external API calls.
    const identityKey = computePersonIdentityKey({
      givenName: pq.givenNames[0],
      surname: pq.surnames[0],
      birthYear, deathYear, state,
    });

    const burialEntry = identityKey
      ? {
          identityKey,
          givenName: pq.givenNames[0],
          surname: pq.surnames[0],
          fullName: bestFullName || undefined,
          surnameSoundex: surnameSoundex || undefined,
          birthYear, deathYear,
          birthDate: typeof birthDate === "string" ? birthDate : undefined,
          deathDate: typeof deathDate === "string" ? deathDate : undefined,
          cemetery, city, county, state,
          lat: hasCoords ? lat : undefined,
          lng: hasCoords ? lng : undefined,
        }
      : null;

    if (identityKey && burialEntry) {
      const cached = await checkResearchCache(
        supabase, identityKey, CURRENT_RESEARCH_VERSION
      ).catch(() => null);
      if (cached) {
        await upsertBurialIndex(supabase, burialEntry).catch(() => {});
        return NextResponse.json({ ...cached, cachedResearch: true });
      }
    }

    const [
      newspapers, naraRecords, landRecords, historical, cemeteryWikiUrl,
      familySearchHints, ssdiRecords, immigrationRecords, historicalCensusRecords,
      wikitreeMatches,
    ] = await Promise.allSettled([
      searchNewspapers({
        name: bestFullName,
        altNames: pq.fullNames.slice(1),
        deathYear,
        deathDateIso: pq.death?.iso,
        state,
      }),
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
        : Promise.resolve(EMPTY_SOURCE),
      // F3: SSDI — only 1936–2014 deaths
      searchSSdI(firstName, lastName, birthYear, deathYear),
      // F5: Immigration passenger records — gated
      runImmigration
        ? searchImmigrationRecords(firstName, lastName, birthYear, deathYear)
        : Promise.resolve(EMPTY_SOURCE),
      // F4: Historical census — 1880–1940 indexed; allow up to 1950
      (!deathYear || deathYear <= 1950)
        ? searchHistoricalCensus(firstName, lastName, birthYear, deathYear, state)
        : Promise.resolve(EMPTY_SOURCE),
      // WikiTree — open API, real inline data; needs a surname + one date anchor
      (lastName && (birthYear || deathYear))
        ? searchWikiTree(pq)
        : Promise.resolve(EMPTY_SOURCE),
    ]);

    // ── Tier 2: Military context (local, instant) ───────────────────────────
    let militaryContext = null;
    if (isMilitary) {
      militaryContext = await getMilitaryContext({
        name, birthYear, deathYear, inscription, symbols,
      });
    }

    // On cache hit, include full geographic context in Phase 1 response.
    // On cache miss, localHistory is empty — Phase 2 fetches and caches all geography.
    const localHistory: LocalHistoryContext = cachedHistory ? (cachedHistory.localHistory || {}) : {};

    // ── Tier 3: Conditional lookups requiring Tier 1/2 results ─────────────
    const landRecordsValue = landRecords.status === "fulfilled" ? landRecords.value : [];
    const hasLandPatents = landRecordsValue.length > 0;

    const [enlistmentResult, usgenwebResult] = await Promise.allSettled([
      militaryContext?.likelyConflict
        ? searchEnlistmentRecords(firstName, lastName, birthYear, militaryContext.likelyConflict)
        : Promise.resolve([] as NaraItemRecord[]),
      (hasLandPatents && state && county)
        ? searchUsGenWeb(state, county)
        : Promise.resolve([] as UsGenWebRecord[]),
    ]);
    const naraItemRecords = enlistmentResult.status === "fulfilled" ? enlistmentResult.value : [];
    const usGenWebRecords = usgenwebResult.status === "fulfilled" ? usgenwebResult.value : [];

    if (usGenWebRecords.length > 0) {
      localHistory.usGenWebRecords = usGenWebRecords;
      if (hasCoords) {
        const existing = cachedHistory || await checkLocalHistoryCache(supabase, lat, lng).catch(() => null);
        const mergedLocalHistory = {
          ...(existing?.localHistory || {}),
          ...localHistory,
        };
        await saveLocalHistoryCache(supabase, lat, lng, {
          localHistory: mergedLocalHistory,
          wikidataEvents: existing?.wikidataEvents || undefined,
          nrhpSites: existing?.nrhpSites || undefined,
        }).catch((err) => console.warn("[local-history-cache-save] USGenWeb failed:", err));
      }
    }

    // ── Unwrap person-source results + build the per-source status map ─────
    const newspapersR  = unwrap(newspapers);
    const fsHintsR     = unwrap(familySearchHints);
    const ssdiR        = unwrap(ssdiRecords);
    const immigrationR = unwrap(immigrationRecords);
    const censusR      = unwrap(historicalCensusRecords);
    const wikitreeR    = unwrap(wikitreeMatches);

    const toStatus = ({ status, fallbackUrl }: SourceResult<unknown>): ResearchSourceStatus =>
      fallbackUrl ? { status, fallbackUrl } : { status };

    const sourceStatus: Record<string, ResearchSourceStatus> = {
      newspapers:        toStatus(newspapersR),
      wikitree:          toStatus(wikitreeR),
      familySearchHints: toStatus(fsHintsR),
      ssdi:              toStatus(ssdiR),
      immigration:       toStatus(immigrationR),
      historicalCensus:  toStatus(censusR),
    };

    // ── F8: Research Checklist — deterministic, zero-cost ──────────────────
    const partialResearch: ResearchData = {
      newspapers:       newspapersR.records,
      naraRecords:      naraRecords.status   === "fulfilled" ? naraRecords.value   : [],
      landRecords:      landRecords.status   === "fulfilled" ? landRecords.value   : [],
      militaryContext:  militaryContext ?? undefined,
      familySearchHints: fsHintsR.records,
      ssdi:             ssdiR.records,
      immigration:      immigrationR.records,
      historicalCensus: censusR.records,
    };
    const partialLocation: GeoLocation = { lat: lat ?? 0, lng: lng ?? 0, city, county, state };
    const researchChecklist = buildResearchChecklist(
      { name, firstName, lastName, birthYear, deathYear, inscription, symbols } as Parameters<typeof buildResearchChecklist>[0],
      partialResearch,
      partialLocation
    );

    const researchLinks = buildAllResearchLinks({
      firstName:      firstName ?? "",
      lastName:       lastName  ?? "",
      birthYear:      birthYear ?? null,
      deathYear:      deathYear ?? null,
      state:          state     ?? "",
      inscription:    inscription,
      symbols:        symbols,
      likelyConflict: militaryContext?.likelyConflict ?? null,
      county:         county    ?? null,
    });

    const responseBody = {
      newspapers:         newspapersR.records,
      naraRecords:        naraRecords.status   === "fulfilled" ? naraRecords.value   : [],
      landRecords:        landRecords.status   === "fulfilled" ? landRecords.value   : [],
      historical:         historical.status    === "fulfilled" ? historical.value    : {},
      cemeteryWikiUrl:    cemeteryWikiUrl.status === "fulfilled" ? cemeteryWikiUrl.value : undefined,
      militaryContext,
      localHistory:       Object.keys(localHistory).length > 0 ? localHistory : undefined,
      wikitree:           wikitreeR.records.length     > 0 ? wikitreeR.records   : undefined,
      familySearchHints:  fsHintsR.records.length     > 0 ? fsHintsR.records     : undefined,
      ssdi:               ssdiR.records.length        > 0 ? ssdiR.records        : undefined,
      immigration:        immigrationR.records.length > 0 ? immigrationR.records : undefined,
      historicalCensus:   censusR.records.length      > 0 ? censusR.records      : undefined,
      naraItemRecords:    naraItemRecords.length > 0 ? naraItemRecords : undefined,
      sourceStatus,
      researchChecklist,
      surnameSoundex:     surnameSoundex || undefined,
      surnameVariants:    surnameVariants.length > 0 ? surnameVariants : undefined,
      researchLinks:      researchLinks.length  > 0 ? researchLinks  : undefined,
      researchVersion:    CURRENT_RESEARCH_VERSION,
    };

    // Harvest the scan and cache the finished research (await: serverless
    // runtimes may kill work scheduled after the response is returned).
    // Don't cache runs with transient failures — the next scan should retry.
    if (identityKey && burialEntry) {
      const anyFailed = Object.values(sourceStatus).some((s) => s.status === "failed");
      await Promise.allSettled([
        upsertBurialIndex(supabase, burialEntry),
        anyFailed
          ? Promise.resolve()
          : saveResearchCache(supabase, identityKey, responseBody, CURRENT_RESEARCH_VERSION),
      ]);
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
