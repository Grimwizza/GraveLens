# GraveLens — Manual Research Page (/research) Implementation Plan

**Decided with Ben (2026-07-17):** a standalone research surface where a user types a name + dates (no photo needed) and gets real in-app research; results feed the shared cache/burial index automatically; findings are archivable. Additionally — **Ben's key structural request** — each archive record's many research sections collapse into a **single "Research" button** that opens this page pre-filled; findings can be **attached back to the originating record**. This dramatically slims the result page.

Written *before* implementation so any model can resume at any checkpoint. Update the checklist as steps land. Companion docs: RESEARCH_V2_ARCHITECTURE.md (tier architecture), SITE_AUDIT_PLAN.md (audit trail), handoff.md (session handoffs).

---

## Why this is cheap: the backend already exists

`POST /api/lookup` accepts plain JSON (`name, firstName, lastName, birthYear, deathYear, birthDate, deathDate, state, city, county, inscription, symbols, people`) — **no photo required**. It already:
- checks the shared research cache first (`grave_identity_index`, version-aware) → repeat searches are $0 and instant,
- runs all free sources (WikiTree scored matches, loc.gov newspapers, NARA military, FamilySearch tree-collision when `FAMILYSEARCH_APP_KEY` set, deep links, checklist),
- **saves successful results back to the cache AND harvests the person into `burial_index`** — Ben's "archived results must reduce future calls" requirement is satisfied by simply routing through this endpoint. No new server work needed for v1.
- Phase-1 lookup uses zero paid Claude calls.

## Decisions (locked)

1. **Add to Archive creates a full photo-less `GraveRecord`** — styled placeholder image, "Research" badge; participates in family grouping, nickname search, editing, cloud sync. NOT a separate notebook section.
2. **Entry points: both** — Home page "Research a name" card + `/research` route + a button in the Archive header. Mobile bottom nav unchanged (5 items).
3. **All four enhancements**: burial-index-first instant results · "Research this person" buttons on relative/community cards · recent-searches list (localStorage, ~10) · optional state field (no GPS on manual searches).
4. **ResultPage slim-down (Ben's addition):** the person-record research sections move OFF the record page, replaced by one summary card/button → `/research?graveId=<id>`. Findings attach back to the record.

## Build order (each step = green build + commit, resumable)

### Step 1 — Extract shared research cards ⬜
ResultPage.tsx (~5000 lines) defines the section cards inline. Extract into `src/components/research/cards.tsx` (single file, named exports), re-import in ResultPage (delete local copies):
- `SectionHeader`, `CONFIDENCE_STYLE`
- `WikiTreeCard`, `SSDICard`, `HistoricalCensusCard`, `ImmigrationCard` (+ `ImmigrationJourneyCard` if trivially portable), newspapers card, `NaraItemCard`, `ResearchLinksCard` (P3 deep-link card near bottom of ResultPage)
- Watch for: refresh-handler props (onRefresh/refreshing) — make them optional; `import("@/types")` inline types; `toNameCase` import.
`SourceStatusCard` is already its own file. `FamilyConnectionHints` stays in ResultPage for now (IDB-coupled) but gets "Research this person" links (Step 5).
**Gate:** tsc/build/tests green, ResultPage renders unchanged. Commit.

### Step 2 — /research page core ⬜
- `src/app/research/page.tsx` (thin) + `src/components/research/ResearchPage.tsx` ("use client").
- Form: First name, Last name, Birth year, Death year, State (optional select — reuse the state list from stateUtils/researchLinks), City (optional text).
- URL params: `?graveId=` (record mode — load via `getGrave`, prefill + attach bar) OR `?firstName=&lastName=&birthYear=&deathYear=&state=` (prefill mode from relative cards).
- On submit:
  1. **Instant tier:** direct `burial_index` query (reuse/extend `fetchBurialIndexRelatives` in community.ts — add a person-search variant matching surname + optional given name + year windows, not cemetery-scoped) → render "In the GraveLens index" hits immediately, including scan_count ("scanned N times by the community").
  2. `POST /api/lookup` with form fields → render via extracted cards (WikiTree, newspapers, SSDI-fallback links, census links, research links, SourceStatusCard). `cachedResearch: true` responses show an "instant — from shared research cache" note.
- Recent searches: localStorage `gl_recent_research` (max 10, dedup by identity key), rendered as tappable chips under the form.
- Auth: page requires session for lookup — reuse the `authRequired`/sign-in card pattern from ResultPage on 401.
**Gate:** manual search for a known name returns real data signed-in. Commit.

### Step 3 — Add to Archive ⬜
- Button on results (manual mode only): builds a `GraveRecord`:
  - `id: "research-" + Date.now() + rand`, `photoDataUrl`: inline SVG data-URL placeholder (stone-800 tile, 🔎 book/stone glyph, gold border — generate once as a constant), same for `thumbnailDataUrl`.
  - `extracted`: from form (name/first/last/years; `source: "claude"`? No — add nothing misleading: keep `source` union; safest is `source: "tesseract"`?? Neither is true. **Add `"manual"` to the `ExtractedGraveData.source` union** and handle anywhere source is displayed), `confidence: "high"` (human-entered), `reviewedAt: Date.now()`.
  - `location`: `{ lat: 0, lng: 0, state, city }` — excluded from map pins automatically (0,0 is filtered).
  - `research`: the lookup response (same shape ResultPage saves).
  - New optional flag `researchOnly?: boolean` on GraveRecord for badge rendering in archive rows ("Research" chip like the "+N person" chip).
- Cloud sync: `upsertGrave` uploads photoDataUrl — check `uploadPhoto` tolerates SVG data URL (it uploads whatever string; verify) or skip photo upload for researchOnly and pass the data URL through.
**Gate:** record appears in archive with placeholder, groups by family, searchable. Commit.

### Step 4 — ResultPage slim-down + attach ⬜ (BEN'S HEADLINE REQUEST)
- Replace in ResultPage's render: WikiTreeCard, SSDICard, HistoricalCensusCard, HouseholdCard, ImmigrationCard(+Journey), NaraItemCard, newspapers card, ResearchLinksCard, SourceStatusCard sections → **one `ResearchSummaryCard`**:
  - Shows per-source hit counts from `record.research` (e.g. "🌳 2 WikiTree · 📰 3 newspapers · 🔗 12 links") + confidence highlights; "Open Research →" navigates `/research?graveId=<id>`.
  - Keep ON the record page: photo/extracted/inscription/symbols/location/cemetery, story (Hear their story), cultural context, historical era card, military context card (stone-derived), FamilyConnectionHints, tags/share/FindAGrave-add.
- `/research?graveId=` mode: header shows "Researching: <name> (from your archive)"; results identical to manual mode; **"Attach to record"** button merges the fresh lookup response into that grave's `research` (getGrave → merge preserving storyScript/narratives/cultural — same merge pattern as ArchivePage bulk enrichment) → saveGrave → cloud sync; toast "Attached — record updated".
- Records with attached research show it in the summary card counts.
**Gate:** record page dramatically shorter; research reachable in one tap; attach round-trips. Commit.

### Step 5 — Entry points + prefill buttons ⬜
- Home page: "Research a name" secondary card near the dropzone → /research. (Home = `src/app/page.tsx` → CapturePage component; add alongside upload UI, match gold/stone styling.)
- Archive header: search-adjacent "🔎 Research" button → /research.
- FamilyConnectionHints: local + community entries get a small "Research →" action → `/research?firstName=&lastName=&birthYear=&deathYear=&state=` (community entries parse identity key or carry fields — `BurialIndexRelative` already has name/years; split name on last space).
- Multi-person pills (optional, if time): same prefill link per person.
**Gate:** all entry points navigate with correct prefill. Commit.

### Step 6 — Verify + docs ⬜
- Signed-in live pass: manual search (cache miss → sources fire → cache write confirmed by immediate re-search returning `cachedResearch: true`), add-to-archive, record-mode attach, relative-card prefill.
- Update this checklist, RESEARCH_V2_ARCHITECTURE.md (research page = the Tier 2 unified panel realized), handoff.md.

## Risks / notes for the next model
- ResultPage is ~5000 lines; extraction must be surgical — move function bodies verbatim, only widen prop types (optional onRefresh). Do NOT reformat unrelated code.
- `""` photoDataUrl breaks `<img>` and `??` fallbacks (empty string isn't nullish) — hence the SVG placeholder constant.
- `source` union widening (`"manual"`) touches type guards — grep `source ===` before assuming.
- Lookup requires ANTHROPIC-free path only; nothing here should call /api/analyze, /api/story, /api/cultural.
- Keys still unset in .env.local: `NARA_API_KEY`, `FAMILYSEARCH_APP_KEY` — both features degrade gracefully without them.

## Status log
- 2026-07-17: Plan written. Steps 1–6 pending.
