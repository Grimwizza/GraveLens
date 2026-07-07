import { NextRequest, NextResponse, after } from "next/server";
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
import type { ResearchData, GeoLocation, NaraItemRecord, LocalHistoryContext } from "@/types";
import { createClient } from "@/lib/supabase/server";
import {
  checkLocalHistoryCache,
  saveLocalHistoryCache,
  computeGraveIdentityHash,
  checkGraveIdentityIndex,
  upsertGraveIdentityIndex,
} from "@/lib/community";
import { CURRENT_RESEARCH_VERSION } from "@/lib/researchVersion";
import { requireRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // This route fans out to ~10 external genealogical APIs; rate-limit to avoid
  // being used as an amplifier against them.
  const rl = await requireRateLimit(auth.userId, "lookup");
  if (rl) return rl;

  try {
    const {
      name, firstName, lastName,
      birthYear, deathYear,
      lat, lng,
      city, county, state, cemetery,
      inscription = "",
      symbols = [],
      confidence,
      supplemental = false,
    } = await req.json();

    const hasCoords = typeof lat === "number" && typeof lng === "number" && (lat !== 0 || lng !== 0);
    const supabase = await createClient();

    // Stable cross-user identity for reusing another contributor's research.
    const identityHash = computeGraveIdentityHash(firstName, lastName, birthYear, deathYear, lat, lng);

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
        ] = await Promise.allSettled([
          getCityContext(city, county, state),
          getDecadeSnapshots(state, birthYear, deathYear),
          searchLocalAreaNews(city, county, state, birthYear, deathYear),
          hasCoords ? searchNrhpSites(lat, lng, birthYear, deathYear) : Promise.resolve([]),
          (hasCoords && (!deathYear || deathYear >= 1970)) ? getCountyPopulation(lat, lng, birthYear, deathYear) : Promise.resolve([]),
          hasCoords ? getLocalWikidataEvents(lat, lng, birthYear, deathYear) : Promise.resolve([]),
        ]);

        const cityCtx    = cityContext.status      === "fulfilled" ? cityContext.value      : {};
        const snapshots  = decadeSnaps.status      === "fulfilled" ? decadeSnaps.value      : [];
        const localNews  = localNewspaper.status   === "fulfilled" ? localNewspaper.value   : [];
        const nrhp       = nrhpSites.status        === "fulfilled" ? nrhpSites.value        : [];
        const census     = censusPopulation.status === "fulfilled" ? censusPopulation.value : [];
        const wikiEvents = wikidataEvents.status   === "fulfilled" ? wikidataEvents.value   : [];

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
      const notables = birthYearNotablesResult.status === "fulfilled" ? birthYearNotablesResult.value : [];

      return NextResponse.json({
        localHistory:      Object.keys(localHistory).length > 0 ? localHistory : undefined,
        birthYearNotables: notables.length > 0 ? notables : undefined,
      });
    }

    // ── Grave identity index: reuse a prior contributor's research snapshot ──
    // Another user (or this user, on a re-scan) may already have run the full
    // fan-out for this exact person. If so, serve the cached public-record
    // research instantly and skip every external call.
    if (identityHash) {
      const match = await checkGraveIdentityIndex(supabase, identityHash).catch(() => null);
      if (match) {
        const snap = match.researchSnapshot as
          | (Record<string, unknown> & { researchVersion?: number })
          | null;
        // Treat a version-stale snapshot as a miss so a pipeline bump re-enriches.
        if (snap && snap.researchVersion === CURRENT_RESEARCH_VERSION) {
          const cachedLocalHistory = cachedHistory?.localHistory;
          return NextResponse.json({
            ...snap,
            // localHistory is geo-cached separately; serve it only if that hit.
            localHistory:
              cachedLocalHistory && Object.keys(cachedLocalHistory).length > 0
                ? cachedLocalHistory
                : undefined,
            fromCache: true,
            contributorCount: match.contributorCount,
          });
        }
      }
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
    const localHistory: LocalHistoryContext = cachedHistory ? (cachedHistory.localHistory || {}) : {};

    // ── F8: Research Checklist — deterministic, zero-cost ──────────────────
    const partialResearch: ResearchData = {
      newspapers:       newspapers.status    === "fulfilled" ? newspapers.value    : [],
      naraRecords:      naraRecords.status   === "fulfilled" ? naraRecords.value   : [],
      landRecords:      landRecords.status   === "fulfilled" ? landRecords.value   : [],
      militaryContext:  militaryContext ?? undefined,
      familySearchHints: familySearchHints.status === "fulfilled" ? familySearchHints.value : undefined,
      ssdi:             ssdiRecords.status   === "fulfilled" ? ssdiRecords.value   : undefined,
      immigration:      immigrationRecords.status === "fulfilled" ? immigrationRecords.value : undefined,
      historicalCensus: historicalCensusRecords.status === "fulfilled" ? historicalCensusRecords.value : undefined,
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

    const responsePayload = {
      newspapers:         newspapers.status    === "fulfilled" ? newspapers.value    : [],
      naraRecords:        naraRecords.status   === "fulfilled" ? naraRecords.value   : [],
      landRecords:        landRecords.status   === "fulfilled" ? landRecords.value   : [],
      historical:         historical.status    === "fulfilled" ? historical.value    : {},
      cemeteryWikiUrl:    cemeteryWikiUrl.status === "fulfilled" ? cemeteryWikiUrl.value : undefined,
      militaryContext:    militaryContext ?? undefined,
      localHistory:       Object.keys(localHistory).length > 0 ? localHistory : undefined,
      familySearchHints:  (familySearchHints.status === "fulfilled" && familySearchHints.value.length > 0) ? familySearchHints.value : undefined,
      ssdi:               (ssdiRecords.status        === "fulfilled" && ssdiRecords.value.length        > 0) ? ssdiRecords.value        : undefined,
      immigration:        (immigrationRecords.status === "fulfilled" && immigrationRecords.value.length > 0) ? immigrationRecords.value : undefined,
      historicalCensus:   (historicalCensusRecords.status === "fulfilled" && historicalCensusRecords.value.length > 0) ? historicalCensusRecords.value : undefined,
      naraItemRecords:    naraItemRecords.length > 0 ? naraItemRecords : undefined,
      researchChecklist,
      surnameSoundex:     surnameSoundex || undefined,
      surnameVariants:    surnameVariants.length > 0 ? surnameVariants : undefined,
      researchLinks:      researchLinks.length  > 0 ? researchLinks  : undefined,
      researchVersion:    CURRENT_RESEARCH_VERSION,
    };

    // ── Write-back: seed the shared identity index for other contributors ────
    // Confidence-gated so low-confidence OCR can't poison the shared pool, and
    // only for records with enough identifying data to be safely matched.
    const canCacheIdentity =
      identityHash &&
      confidence !== "low" &&
      (firstName || lastName) &&
      (birthYear || deathYear);
    if (canCacheIdentity) {
      // localHistory is excluded (it has its own geo-cell cache); no user
      // notes/tags ever enter this snapshot — it is public-record research only.
      // (undefined values are dropped on JSON serialization into the jsonb column.)
      const snapshot = { ...responsePayload, localHistory: undefined };
      after(() =>
        upsertGraveIdentityIndex(supabase, identityHash as string, snapshot).catch((err) =>
          console.error("[grave-identity-index-save] failed:", err)
        )
      );
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("Lookup error:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
