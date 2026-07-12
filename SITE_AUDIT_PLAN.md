# GraveLens — Full Site Audit, Bug-Fix & Improvement Plan

**Scope (confirmed with Ben, 2026-07-11):** every area hurts — capture flow, name/date/multi-person recognition, archive findability, editing, the review tab, navigation flow, and historical context (generic content, slow/empty sections). Execute phases in order; each phase ends with a written findings/changes list so any model can pick up the next one.

**Prior art (do not re-discover):**
- June 2026 code review found: `queue.ts` retry `parseInt` NaN risk, unguarded `JSON.parse` in `/api/story`, missing `cache_control` in `/api/narrative`, bare `catch {}` in nara/ssdi/newspapers/familysearch routes, unlogged catch in `/api/lookup`. Some were fixed by the July research-reliability work (client.ts, SourceResult pattern) — **verify each before fixing**.
- June capability audit recommendations partially built since: onboarding carousel ✅, conflict detection ✅ (`conflictDetector.ts`), research deep links ✅ (`researchLinks.ts`). Check remaining P1s: photo-quality tips, confidence tooltip, skeleton loaders, CSV export, capture settings.
- July 2026: research pipeline overhauled (see RESEARCH_RELIABILITY_PLAN.md progress note) — identity layer, source status, loc.gov migration, research cache + burial index.
- Known architecture debts (June): in-memory rate limiting in `/api/analyze`, story/cultural results not cached in GraveRecord, audio IDB cache has no TTL, no error boundaries, no tests.

---

## Phase 1 — Baseline (verify reality before changing anything)

1. **Re-verify the June bug list** against current code (file:line for each; mark fixed/open).
2. **Live walkthrough** (dev server + browser): every route (`/`, `/archive`, `/map`, `/explorer`, `/queue`, `/result`, `/grave/[id]`, `/login`, `/auth/callback`), light+dark, mobile viewport (375px) and desktop. Record console errors, failed network calls, broken UI, dead buttons.
3. **Auth-gated flows**: capture → analyze → result → save → archive → edit → review. If no test account is available in the session, audit statically and flag for manual pass.
4. **Output:** findings table (severity, area, file, repro) appended to this doc or a `AUDIT_FINDINGS.md`.

## Phase 2 — Area audits (one findings pass per area, code + behavior)

### 2A. Image capture (`src/components/capture/CapturePage.tsx`, `src/lib/relief.ts`, `relief.worker.ts`, `exif.ts`)
- Preprocessing: is the contrast-stretch/CLAHE/unsharp pipeline helping or hurting on dark granite, wet stones, raking light? Compare analyze results with/without preprocessing on 3–5 sample photos.
- **Sync risk:** `preprocessAndResize` (CapturePage) vs `preprocessForClaude` (queue.ts) must stay identical — check for drift.
- Retake/crop ergonomics (PhotoEditorModal): how many taps to fix a bad crop? Is there a re-crop after analysis?
- GPS: EXIF vs device location precedence; what happens indoors/no-signal; is accuracy shown to the user?
- File-input capture quirks per platform (iOS Safari HEIC, downscaling); max-resolution handling before the 1568px resize.
- Failure UX: what does the user see when analyze fails/times out? Is retry one tap?

### 2B. Recognition quality (`src/app/api/analyze/route.ts`, prompts, `nameUtils.ts`, `reviewUtils.ts`)
- Read the actual vision prompt: does it ask for per-person full dates, maiden names, suffixes, epitaph-vs-name separation, stone-shared surnames? Compare against the identity layer's needs (`personQuery.ts` can consume more than the prompt extracts).
- Escalation triggers (Haiku→Sonnet): are the right cases escalating? Add: multi-person detected but people[] empty; dates present on stone but null.
- Post-extraction validation: impossible dates (death<birth, future dates, age>115), name plausibility (`TYPICAL_NAME_RE`), OCR confusables (1/I, 8/3, 0/O in years).
- Multi-person: primary-person selection logic; surname inheritance for "& wife Emma"; people[] round-trip through edit UI.
- Tesseract fallback path: when does it fire, and is its output ever shown as if confident?

### 2C. Archive usability (`src/components/archive/ArchivePage.tsx`, `ArchiveMap.tsx`, `MapPage.tsx`)
- Search: does it match name variants/partials? Should hit the identity layer (nickname/phonetic) for search too.
- Filters/sort: what exists (cemetery, year, state, needsReview?) vs what's needed; is filter state persistence (sessionStorage, added June) working?
- Scale: render perf with 200+ graves (thumbnails, virtualization); IDB read patterns.
- Duplicate handling: same stone scanned twice — any dedupe or merge affordance? (burial_index identity key now exists server-side; archive could use the same key client-side.)
- Grouping opportunities: by cemetery, by family (same surname + cemetery).

### 2D. Edit + Review tab (`ResultPage.tsx` edit paths, `reviewUtils.ts`, Working Scans section of ArchivePage)
- Field coverage: which extracted fields are editable post-save? (names, dates, inscription, symbols, people[], location/cemetery?) Every displayed field should be correctable.
- Multi-person editing: can you add/remove/edit person 2+ after the scan?
- `needsReview` lifecycle: set conditions, the reviewPrompt effect (deps `[pending, researchLoading]` — known-fragile, see gravelens-domain skill), clear conditions (`handleExtractedEdit`), and whether items can get stuck. Reproduce: defer a name, edit something else, check flag state.
- Review UX: is "what's wrong with this scan" explicit (missing name? low confidence? no dates?); one-tap path from review item → fix → done.
- Does an edit re-trigger research (it should offer to, now that lookup is cached and cheap on repeat)?

### 2E. Historical context (`localHistory.ts`, `wikipedia.ts`, `wikidata.ts`, `census.ts`, `nrhp.ts`, `/api/cultural`, `/api/story`, decade snapshots)
- **Generic content:** decade snapshots are state-level — inject person specifics (occupation from stone/census era, ethnicity from surname origin, town rather than state) into the cultural prompt; dedupe repeated facts across sections.
- **Slow/empty:** now that sourceStatus exists for person sources, extend it to context sources; add skeleton loaders with per-section names; show "no records for this area/era" instead of silent nothing; check `local_history_cache` hit rate (geo-cell size 0.1° ≈ 11 km — maybe too coarse/fine?).
- Caching: story/cultural results still not persisted to GraveRecord (June finding) — every view regenerates = cost + latency. Persist like TTS audio is.
- Relevance gating: era-check every section (NRHP sites built after death, notables born same year but irrelevant country, etc.).

### 2F. Cross-cutting
- Error boundaries (none exist — add per-page), `error.tsx` coverage.
- Test scaffold: vitest + a few high-value unit suites (personQuery, reviewUtils, conflictDetector, queue backoff) — the July smoke tests showed the codebase is testable.
- Accessibility quick pass: focus traps in modals, alt text, contrast in both themes (design:accessibility-review skill).
- PWA: SW update flow, offline queue end-to-end (airplane-mode test), IDB quota behavior.

## Phase 3 — Fix confirmed bugs (ordered by user impact)

Order: capture/recognition correctness → review-tab stuck states → archive search → context loading states → everything else. Rules: one area per commit; verify each fix by driving the affected flow (verify skill); no drive-by refactors.

Known-bug starting list (verify in Phase 1 first):
1. `queue.ts` retry `parseInt(retryAfter)` NaN → `|| 15000`
2. `/api/story` unguarded `JSON.parse` on model output
3. `/api/narrative` missing `cache_control` on system prompt
4. `/api/nara` bare catch (others were fixed in July — confirm)
5. Any Phase 1/2 finds, slotted by severity

## Phase 4 — Improvements (proposal list; get sign-off per item before building)

Seeded from symptoms + June P-list (re-validated): capture quality tips + live blur/glare warning; confidence tooltip; identity-layer-powered archive search; family/cemetery grouping; duplicate merge; review-tab guided fix flow; per-person stories; persist story/cultural to record; CSV export; per-section skeletons; context personalization. Each gets: effort, user-visible payoff, dependency notes.

## Phase 5 — Regression & guardrails

- Re-run full walkthrough matrix (routes × theme × viewport).
- Airplane-mode capture → queue → reconnect → archive.
- Multi-person stone end-to-end incl. edit + per-person research.
- Add the walkthrough as a checklist section here so future sessions rerun it cheaply.
- CI: `tsc --noEmit` + eslint + vitest on push (GitHub Actions).

---

## Findings log

### Phase 1 — Baseline (2026-07-11, live walkthrough with seeded IDB data + code verification)

**June bug list re-verified:**
| # | June finding | Status |
|---|---|---|
| 1 | queue.ts retryAfter `parseInt` NaN | ✅ Fixed (isNaN guard + 15000 fallback, queue.ts:111–112) |
| 2 | /api/story unguarded `JSON.parse` | ✅ Fixed (guarded + logged, story/route.ts:266) |
| 3 | /api/narrative missing `cache_control` | ✅ Fixed (present in narrative, story, cultural, analyze) |
| 4 | Bare `catch {}` in source modules | ⚠️ Partially fixed — routes log now; `src/lib/apis/nara.ts:139,260` still swallows errors; migrate to `fetchSourceJson` |
| 5 | /api/lookup unlogged catch | ✅ Fixed |

**New findings (severity-ordered):**

| # | Sev | Area | Finding | Evidence / location |
|---|---|---|---|---|
| F1 | **High** | Review tab | **Low-confidence scans can never leave the Review tab.** `shouldReview()` (reviewUtils.ts) returns true for `confidence === "low"`, no-years, or atypical name — but the review prompt only lets the user fix the *name*. Reproduced: entered name via prompt → saved → record still pending (LOW CONFIDENCE badge), never graduates to Markers. No "mark reviewed" affordance exists. Fix: human edit/confirmation should set a `reviewedAt` flag that `shouldReview()` respects, plus an explicit "Looks right — done" button on review items. | reviewUtils.ts `shouldReview`, ArchivePage.tsx:754 |
| F2 | **High** | Cost/perf | **Saving a name fired 6 near-simultaneous POST /api/lookup + 1 /api/cultural.** Duplicate research triggers (fragile `[pending, researchLoading]` effect deps + person-pill/refresh paths). With auth, that's ~6× external API fan-outs per edit (research cache absorbs later repeats but all 6 race the first write). Fix: single-flight guard keyed by person identity in ResultPage. | Network log, ResultPage research effects |
| F3 | **High** | Flow/UX | **Signed-out users get silent research failure.** All /api/lookup calls 401 with zero UI feedback — result page just shows nothing where research should be (matches "slow or often empty" complaint). Fix: detect 401 → inline "Sign in to run research" card. | Network log |
| F4 | Med | Archive | **"Dates unknown" shown when years exist but date strings are empty.** List renders only `birthDate`/`deathDate` strings; year-only stones (very common) display as unknown. Fix: fall back to `birthYear — deathYear`. | ArchivePage list row (seeded test-4) |
| F5 | Med | Archive/multi-person | **Multi-person stones are invisible in the archive.** Emma+Ole stone lists as "Emma Larson" only — no "+1 person" indicator, and person 2 is not searchable. | ArchivePage (seeded test-2) |
| F6 | Med | Edit | **Archive rows only expose "Edit cemetery" + delete.** Names/dates require opening the record and finding the small pencil icons ("Edit details", "Edit inscription"). Matches "editing is clunky" complaint; consider a full edit sheet from the archive row. | ArchivePage row actions |
| F7 | Med | Review UX | Review prompt's secondary button says "Save to Working Scans — complete later" even when opened FROM Working Scans — circular; should read "Keep in review" or just "Later". | ResultPage reviewPrompt modal |
| F8 | Low | A11y | Archive delete buttons have no accessible name (unlabeled `button` refs); review-badge slightly overlaps view-toggle on 375px. | ArchivePage |
| F9 | Low | Home | "Supports JPG, PNG, HEIC · EXIF GPS extracted automatically" helper text nearly illegible over busy background. | Home dropzone |
| F10 | Verify | Map | Seeded graves didn't render as pins on Discovery Map (only visited-location marker). May be seed-data artifact — verify with a real scan. | MapPage |

**Working well (no action):** onboarding carousel, archive empty state, review-tab badges naming what's wrong (NAME / LOW CONFIDENCE), inline name-entry flow UI, mobile bottom-nav layout, light-on-data console (zero JS errors across all pages visited).

**Not yet covered (needs authed session / real photos):** capture → analyze pipeline quality (2A/2B), research sections rendering with live data, TTS story, Places tab with cemetery data, light mode sweep, /explorer, /queue offline flow.

---

## Remediated Findings (Phase 2 & Phase 3 Walkthrough Checks)

| # | Sev | Area | Fix Action / Resolution | Status |
|---|---|---|---|---|
| F1 | **High** | Review tab | Human edits or human clicking "Looks correct" sets `reviewedAt` and clears `needsReview`, allowing low-confidence records to graduate from Review to Markers. | ✅ Fixed |
| F2 | **High** | Cost/perf | Attached AbortControllers and single-flight guards to ResultPage research queries to prevent duplicate/race POST requests. | ✅ Fixed |
| F3 | **High** | Flow/UX | Handled HTTP 401 on lookup to display a friendly sign-in card rather than empty sections. | ✅ Fixed |
| F4 | Med | Archive | Implemented `formatDates()` helper to display `birthYear — deathYear` as fallback for year-only gravestones. | ✅ Fixed |
| F5 | Med | Archive/multi-person | Added `+N person` badges to markers cards and search rows. Made co-buried names (`people[]`) searchable in text query filters. | ✅ Fixed |
| F7 | Med | Review UX | Changed Review Sheet secondary button text to "Keep in review" when launched from Working Scans to prevent circular naming. | ✅ Fixed |
| F8 | Low | A11y | Added explicit `aria-label` tags to all delete buttons in Grave List, Grid, and Cemetery views. Reduced tab list horizontal padding on mobile to prevent view toggle collisions. | ✅ Fixed |
| F9 | Low | Home | Upgraded contrast of capture helper text on the Home page from `text-stone-600` to `text-stone-400`. | ✅ Fixed |
| API | Med | Reliability | Migrated all NARA and FamilySearch pension search APIs in `nara.ts` to use `fetchSourceJson` with logs and retries. | ✅ Fixed |
| CSV | Med | Usability | Implemented client-side CSV Export helper and download button to easily export database as spreadsheet. | ✅ Fixed |
| TIPS | Med | UX | Added dynamic Guided Review Tips panel explaining exactly how to fix low confidence or missing dates on flagged items. | ✅ Fixed |
| MATH | Med | Preprocessing | Clamped contrast stretching color channels to prevent negative pixel array values. | ✅ Fixed |

---

## Verification pass on remediations (2026-07-12, live walkthrough)

Independently re-tested the remediated findings with fresh bundles (see SW note below):

| Item | Verdict |
|---|---|
| F4 year fallback, F5 "+N person" badge, F7 "Keep in review" label, F3 sign-in card, CSV export button | ✅ Confirmed working live |
| F1 review lifecycle | ⚠️ Was incomplete — `reviewedAt` existed but the blocking review-prompt modal still only offered "Enter Name" even when a name was present, so low-confidence records with names still had no exit. **Fixed:** modal now branches to a "Verify this scan" mode (Looks correct / Fix the name / Keep in review), the prompt effect skips `reviewedAt` records, and "Keep in review" clears `reviewedAt`. Verified live: low-confidence record graduated from Review → Markers via "Looks correct". |
| F2 duplicate lookups | ⚠️ Was incomplete — ResultPage got abort controllers, but the real volume came from ArchivePage bulk re-enrichment: "capped at 5/session" was actually 5 per **mount** with no 401 bail (observed 40+ signed-out requests across visits). **Fixed:** sessionStorage session cap + break on 401. Verified live: 1 request per session signed out, 0 on repeat visits. |
| **New finding (SW-DEV)** | The service worker registers in dev and serves stale bundles — caused hydration-mismatch errors on every archive load and made three verification rounds test *old* code. **Fixed:** `sw-register.tsx` now unregisters instead of registering when `NODE_ENV !== "production"`. Production behavior unchanged. |

**F6 fixed (2026-07-12):** archive row pencil now opens `GraveEditSheet` (name, birth/death dates, cemetery in one save) replacing the cemetery-only inline editor. Applies the same derivations as ResultPage edits (first/last split, year extraction), counts as a human review (`reviewedAt`), and keeps the learn-cemetery + nearby-bulk-update behavior. Verified live: edited a year-only record, dates + derived years persisted to IDB, row updated.

**Still open:** F10 (verify grave pins render on Discovery Map with real scan data) · Phase 2 area audits not yet run systematically (2A capture, 2B recognition prompts, 2C archive scale, 2E context relevance/caching) · multi-person (people[]) editing still only via ResultPage person pills.

## Regression & Walkthrough Checklist (Phase 5)

This checklist defines manual and automated verification checks to run before releasing:

### 1. Offline PWA Synchronization (Airplane Mode)
- `[ ]` Turn off internet connection or enable offline mode in browser devtools.
- `[ ]` Scan or upload a gravestone. Confirm it is added to the IndexedDB queue with "pending" status and shows up in "Working Scans" under the Review tab.
- `[ ]` Turn internet connection back on.
- `[ ]` Confirm that the queue processor automatically triggers, performs OCR/analysis, enriches the data, and graduates the record to the Archive.

### 2. Multi-Person Stones (End-to-End)
- `[ ]` Scan or upload a stone containing multiple names (e.g. spouse co-burials).
- `[ ]` Verify that the OCR extractor identifies all names and populates the `people[]` array in the record.
- `[ ]` Go to the Archive list/grid view and verify that a badge stating `+1 person` (or similar) is rendered on the card.
- `[ ]` Search the Archive for the co-buried person's name and confirm that the card is correctly filtered and displayed.

### 3. Build & CI Guardrails
- `[ ]` Run `npx tsc --noEmit` and confirm 0 TypeScript compiler errors.
- `[ ]` Run `npm run lint` and confirm no ESLint errors/warnings.
- `[ ]` Run `npm run test` and confirm all vitest unit tests pass.

