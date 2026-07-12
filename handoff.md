# GraveLens Context Handoff

## Accomplished Tasks
- **F7: USGenWeb Probate & Land Record Search:**
  - Implemented the directory scraper client (`src/lib/apis/usgenweb.ts`) searching `files.usgwarchives.net/[state]/[county]/` with regex-based parsing for Wills, Deeds, and Land abstracts.
  - Built a resilient fallback to targeted Google Site Searches when `usgwarchives.net` is unreachable or times out (which handles the current global outage of the domain).
  - Integrated the lookup conditionally on BLM GLO land patents in `route.ts`, caching results cell-wide in the shared geography cache database.
  - Rendered results in `ResultPage.tsx` under the Local History card panel with category tags.
- **F9: FamilySearch Tree Collision Detection:**
  - Built token negotiation for unauthenticated OAuth sessions via `https://ident.familysearch.org/cis-web/oauth2/v3/token` in `src/lib/apis/familysearch.ts`.
  - Added public space searches via `/platform/tree/search` utilizing name, birth, and death year range logic.
  - Implemented a biographical confidence validator (requiring score >= 0.7 to register a tree match hit).
  - Rendered a non-intrusive matching warning card on the details page with deep-links to pre-filled searches.
- **Linter & Test Verification:**
  - Added Vitest tests for the FamilySearch collision matching confidence scoring logic.
  - `npx tsc --noEmit` compiles with **0 errors**.
  - `npm run lint` completes with **0 warnings and 0 errors**.
  - `npm run test` passes with **37/37 tests successful**.
- **Git Push:** Committed and pushed all changes to `main` branch.

## Unresolved Bugs
- None.

## Knowledge Gained
- **FamilySearch Unauthenticated Sessions:** The public tree search can be queried using a client ID/App Key without a user session token.
- **Sinkholed Sites Fallback:** For volunteer repositories experiencing downtime, pre-filled Google Site searches serve as a viable and extremely useful fallback.

## Immediate Next Steps
- **Phase 5 Verification:** Verify offline PWA sync queue behavior, multi-person marker recognition, and auth features using browser devtools and manual scans.
