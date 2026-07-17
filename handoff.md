# GraveLens Context Handoff

## Accomplished Tasks

### Research Page Feature (RESEARCH_PAGE_PLAN.md) — ALL 6 STEPS COMPLETE ✅

- **Step 1:** Extracted research-section cards into `src/components/research/cards.tsx` (967 lines). ResultPage reduced from 5404 → 4450 lines with no visual change.
- **Step 2:** `/research` page live — form with first/last/birth/death/state/city; URL prefill via `?firstName=`/`?graveId=`; burial-index instant tier (`searchBurialIndexPeople` in community.ts); `/api/lookup` wiring with `cachedResearch` badge; signed-out 401 → in-page sign-in card; recent-searches chips (localStorage).
- **Step 3:** Add to Archive — photo-less `GraveRecord` with `researchOnly` flag, RESEARCH_PLACEHOLDER_IMAGE SVG (`src/lib/researchPlaceholder.ts`), `source: "manual"`, `reviewedAt` set; cloudSync passes SVG data-URLs through as-is; archive list shows gold RESEARCH chip.
- **Step 4:** ResearchSummaryCard replaces all 12+ inline research sections on ResultPage. Slim record page shows source counts + "Open →" to `/research?graveId=`. "Attach findings" merges lookup into grave.research, saves to IDB + cloud.
- **Step 5:** Entry points — Archive header magnifier button → /research; community-relative rows → `/research?firstName=…` prefill. Home "Research a name" link present.
- **Step 6 (E2E Verified):**
  - Manual search (Herman Schreiber 1880–1942): live results, GraveLens index + newspaper cards.
  - Add to Archive: "✓ Added to Archive" confirmation, record appears with RESEARCH chip + placeholder.
  - Cache-hit re-search: "Served instantly from the shared research cache" badge confirmed.
  - Record-mode attach: `/research?graveId=` pre-filled, "✓ Attached — record updated" confirmed.
  - Archive header Research button ✅. Home page has no dedicated Research card (navigates via Archive).

### Earlier Features (carried forward)
- **F7 USGenWeb:** Directory scraper + Google fallback, integrated in route.ts, cached geographically.
- **F9 FamilySearch Tree Collision:** Token negotiation, confidence scoring (≥0.7), warning card on detail page.

## Unresolved Bugs
- None.

## Knowledge Gained
- **FamilySearch Unauthenticated Sessions:** Public tree search works with client ID/App Key only.
- **Sinkholed Sites Fallback:** Volunteer repos (USGenWeb) degrade gracefully to pre-filled Google Site searches.
- **ResearchOnly flag:** `GraveRecord.researchOnly?: boolean` controls the RESEARCH chip and placeholder rendering across list/tile/cover archive views (list view verified; tile/cover views are minor TODOs).

## Immediate Next Steps
- **Tile/Cover RESEARCH chip:** `researchOnly` badge rendering is done for list view; tile and cover views could show the chip too (low priority).
- **SSDI/Census cards on /research:** Sources degrade gracefully today; when data returns, surface the existing cards.
- **Phase 5 broader verification:** Offline PWA sync queue, multi-person marker recognition, auth edge cases.
