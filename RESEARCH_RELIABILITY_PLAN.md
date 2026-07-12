# GraveLens — Real Genealogy Research: Diagnosis & Options

**Goal:** Make person-specific research results reliable, precise, and genuinely useful — so a scanned headstone leads to real, verifiable records about that exact person.

**TL;DR of the diagnosis:** The inconsistency is not flakiness — most of the person-record integrations are structurally broken and failing silently. Two of the app's data foundations no longer exist in the form the code assumes: FamilySearch's records-search API requires OAuth (the app calls it unauthenticated → 401 → silently returns "no records"), and the Chronicling America legacy API was retired August 4, 2025 (the app still calls the dead endpoint). The universal `catch { return [] }` pattern makes broken APIs indistinguishable from "person not found," which is exactly the "works sometimes" symptom.

---

## Part 1 — Root Causes (confirmed against code + live API status, July 2026)

### RC1 — FamilySearch API calls are unauthenticated, but the endpoint requires OAuth ❌ CRITICAL
`https://api.familysearch.org/platform/records/search` is called with no token in **four modules**:
- [familysearch.ts](src/lib/apis/familysearch.ts) (record hints)
- [ssdi.ts](src/lib/apis/ssdi.ts) (SSDI death index)
- [immigration.ts](src/lib/apis/immigration.ts) (Ellis Island / Castle Garden / naturalization)
- [historicalCensus.ts](src/lib/apis/historicalCensus.ts) (1880–1940 census)

FamilySearch's docs: only Places, Date Authority, Person Search, Person Matches, and Relationship Finder support unauthenticated sessions — and even an "unauthenticated session" requires a developer key to mint a token. **Historical records search additionally has restricted third-party access (partner-gated).** These four calls very likely 401 on every request and return `[]` via `if (!res.ok) return []`. This is the single biggest reason "real data about the person" never shows up.

> The `.agent/skills/genealogical-apis/SKILL.md` file asserts these are "free, unauthenticated" — the skill itself is wrong and must be corrected as part of any fix, or future sessions will keep rebuilding on the broken assumption.

### RC2 — Chronicling America legacy API retired (Aug 4, 2025) ❌ CRITICAL
[chronicling.ts](src/lib/apis/chronicling.ts) calls `chroniclingamerica.loc.gov/search/pages/results/?format=json`. The Library of Congress migrated the collection; the legacy API "ceased to be relevant" and access is now **exclusively via the loc.gov API** (`https://www.loc.gov/collections/chronicling-america/?fo=json`) with different parameters. Both `searchNewspapers` (obituaries) and `searchLocalAreaNews` are affected.

### RC3 — Silent-failure pattern hides all of the above ⚠️ SYSTEMIC
Every API module ends with `if (!res.ok) return []` and/or bare `catch { return [] }`. Consequences:
- A dead API looks identical to "no records exist for this person."
- No logging → no way to notice RC1/RC2 happened.
- No retry → transient Overpass/Wikidata/NARA hiccups (which DO work) also produce empty sections randomly. This is the residual "inconsistency" on the integrations that aren't dead.
- Violates the repo's own `api_architect` rule ("bare `catch(() => {})` blocks are a violation").

### RC4 — Queries are under-parameterized ⚠️ PRECISION
The app knows more about the person than it sends:
- **Place is never used in person queries.** Cemetery GPS → state/county/city are available, and burial place ≈ death place is a strong prior. FamilySearch supports `q.deathLikePlace`, `q.residencePlace`; loc.gov supports `location_state`. Only newspapers gets `state`.
- **Phonetic variants are computed but never queried.** `phonetic.ts` (Soundex + Double Metaphone, 299 lines) only decorates the response for display (`surnameVariants`); no search actually fans out over variants (Schmitt/Schmidt/Smith problem unsolved in practice).
- **Full dates truncated to years.** The stone often gives exact birth/death dates; queries send `±1–2 year` windows only. Exact death date is the highest-precision discriminator SSDI-type sources have.
- **Multi-person stones ignored as evidence.** A spouse on the same stone is a devastatingly good disambiguator (FamilySearch supports `q.spouseGivenName`/`q.spouseSurname`); never used.

### RC5 — Name data isn't normalized for search ⚠️ PRECISION
[nameUtils.ts](src/lib/nameUtils.ts) only does display casing. OCR names go into queries raw:
- Historical abbreviations not expanded: `Wm.` → William, `Jas.` → James, `Chas.` → Charles, `Geo.` → George, `Thos.` → Thomas.
- Epithets/titles not stripped: "MOTHER", "REV.", "DR.", "CAPT." pollute `q.givenName`.
- Maiden names (`née Schmidt`, "SMITH formerly JONES") not split into an alternate-surname search.
- Nickname equivalence absent: stone says "Mollie," records say "Mary"; "Peggy"/"Margaret"; "Jack"/"John".
- Middle names/initials not handled (search with and without).

### RC6 — NARA runs on `DEMO_KEY` ⚠️ RELIABILITY
[nara.ts](src/lib/apis/nara.ts) hardcodes `DEMO_KEY` (api.data.gov demo tier: ~30 req/hr, ~50/day, **per IP**). On Vercel, egress IPs are shared across many tenants — the quota may be exhausted by strangers. A real key is free and takes minutes.

### What actually works today
OSM Overpass (cemeteries), Wikipedia/Wikidata (context), NRHP, Census population, BLM GLO deep links, and the zero-cost deep links in [researchLinks.ts](src/lib/researchLinks.ts). Notice the pattern: **everything reliable is either a truly open API or a deep link.** Everything person-specific that depended on FamilySearch's API is dead.

---

## Part 2 — Options

Ordered by leverage. These are compatible — the recommendation at the end sequences them.

### Option 1 — "Deep-Link First" architecture 🥇 (simplify + immediate usability)
**Idea:** Stop treating in-app API results as the primary research product. Make *perfectly parameterized, pre-filled search links* into the major genealogy sites the first-class research surface — the user's own free FamilySearch account (and FindAGrave / Ancestry / Newspapers.com if they have them) does what no free API can.

- FamilySearch **web** search URLs accept the same rich params the API does and require no API key: `familysearch.org/search/record/results?q.givenName=…&q.surname=…&q.birthLikeDate.from=…&q.deathLikePlace=…&f.collectionId=…`. Logged-in users see full record hits. The SSDI, census, draft-card, and immigration "searches" become collection-scoped deep links that *always work*.
- FindAGrave: `findagrave.com/memorial/search?firstname=…&lastname=…&birthyear=…&deathyear=…&location=…` — cross-reference the burial itself, family plot members, existing photos/bios. (No public API; deep link is the only option and it's a good one.)
- BillionGraves, Newspapers.com, GenealogyBank, Ancestry search URLs — same pattern.
- `researchLinks.ts` already proves this works (state death records, WWI draft). Extend it into the primary "Research this person" panel: one button per source, each URL built by the shared query builder (Option 3), grouped by record era/type, with "requires free account" badges.

**Why this is the honest win:** GraveLens's real job is *aiming* the search precisely (name variants + exact dates + place). Precision aiming + the user's own accounts beats half-working APIs. Zero external dependencies, zero API cost, nothing to break.
**Effort:** 2–3 sessions. **Risk:** none. **Tradeoff:** results live on the destination site, not inline in the app.

### Option 2 — Fix the plumbing that is fixable (reliability)
1. **Migrate Chronicling America → loc.gov API.** Endpoint `https://www.loc.gov/collections/chronicling-america/?qs=<terms>&ops=PHRASE&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&location_state=<State>&fo=json`; OCR text arrives in `full_text`. Watch the throttling (keep queries faceted; cache results). Restores obituary search for pre-1964 deaths — one of the highest-value person hits the app can make.
2. **Get a real api.data.gov key for NARA** (free, instant) → env var, replace `DEMO_KEY`.
3. **Get a free FamilySearch developer key** (developers.familysearch.org — free for individuals) and use the *unauthenticated session* token for the endpoints that legitimately allow it (Places, Date Authority, **Person Search / Person Matches** — tree search, useful "this person already has a researched profile" hits). Do **not** rebuild on `platform/records/search`: that stays partner-gated (see Option 6).
4. **Centralized fetch client** (`src/lib/apis/client.ts`): timeout, 1 retry with jitter, per-source telemetry counter (success/failure/latency) logged server-side, and a typed result: `{ status: "ok" | "failed" | "empty", records }`.
5. **Surface source status in the UI.** "SSDI: source unavailable ⟶ try the direct link" is fundamentally different from "no SSDI match." This one change converts every future API breakage from a silent data-quality mystery into a visible, user-routable event. Store per-source status in the `ResearchData` payload.
6. **Cache successes in Supabase** (like `checkLocalHistoryCache` already does for geography) keyed by person-identity hash, so a working answer survives later outages and repeat scans cost nothing.

**Effort:** 3–4 sessions. **Risk:** low. Restores newspapers + NARA reliability; makes all remaining failures visible.

### Option 3 — Identity Query Builder + match scoring (precision — fixes "not enough parameters")
One module, `src/lib/research/personQuery.ts`, consumed by every API module and every deep-link builder:

```
buildPersonQuery(record) → {
  givenNames:  ["William", "Wm", "Willie", "Bill"],   // abbreviation + nickname expansion
  surnames:    ["Schmitt", "Schmidt", "Smith"],        // Double Metaphone variants (phonetic.ts, finally used)
  maidenName:  "Bauer" | null,                         // parsed from née/"formerly"
  birth: { year, month?, day?, window: [y-2, y+2] },
  death: { year, month?, day?, window: [y-1, y+1] },
  places: { state, county, city },                     // from cemetery GPS via nominatim
  coBuried: [{ name, relationship? }],                 // multi-person stone data (people[])
  spouse: { givenName, surname } | null,
}
```
Plus a shared `scoreCandidate(candidate, query)` implementing the cross-validation matrix already specced in the `genealogical-apis` skill (name edit distance, date deltas, state match), so every source's results carry the same high/medium/low confidence and a human-readable "matched on: exact death date + state" explanation.

Search strategy per source: **precise first, widen on empty** (exact name + tight dates + place → drop place → phonetic surname variants), instead of one mid-precision shot. This is what turns "1,400 John Smiths" into "the John Smith who died 14 Mar 1923 in Waukesha County, husband of Emma."

**Effort:** 3–4 sessions incl. nickname/abbreviation dictionaries (public domain lists exist). **Risk:** low. **This multiplies the value of both Option 1 links and Option 2 APIs.**

### Option 4 — Swap in sources that are actually open (fill the FamilySearch hole)
- **WikiTree API** — free, JSON, no auth for public profiles (just an `appId` param to avoid strict rate limits). Person search + full profiles with sourced facts and family links. Excellent "someone already researched this person" signal. Straight replacement-grade for the FamilySearch *hints* feature.
- **Internet Archive full-text search** — free; county histories, city directories, old yearbooks, and (via Reclaim the Records) raw state vital-record scans. Good for pre-newspaper-era and "local history mentions this family" hits.
- **Own death index (differentiator):** several states publish open death indexes (Ohio 1908–1963, Michigan 1897–1943, Missouri, WV, NC; Maryland certs 1898–2012 via Reclaim the Records on archive.org). Ingest 2–5 of them into Supabase Postgres (a few million rows, trivial for Postgres, ~free at this scale) → **GraveLens gets its own instant, never-breaking, exact-match death index** with real dates/places. Start with the states where you actually scan. This is the only option that gives *inline, in-app, verified person records* without a partner agreement.
- Keep: Overpass, Wikidata, Wikipedia, NRHP, BLM, loc.gov (post-Option 2).

**Effort:** WikiTree 1 session; archive.org 1 session; each state index ~1–2 sessions (parse + load + query). **Risk:** low; ingestion is per-state grunt work.

### Option 5 — Claude as the research agent (usability leap, costs money)
A "Deep Research" button: server-side, Claude with web search/fetch tools takes the person-query bundle and does what a human genealogist does — searches modern obituaries (post-1963 deaths, where Chronicling America can't go), locates FindAGrave memorials, cross-checks candidates, and returns a short **sourced** narrative with links and a confidence assessment. Modern obituaries are the single biggest coverage gap for 20th–21st-century burials and have *no* free API at all; an agent with web search is the only real way in.
- Cost: roughly $0.05–0.30 per deep-research run depending on model/depth — this is the natural **premium feature** for the monetization plan in [NATIVE_APP_PLAN.md](NATIVE_APP_PLAN.md) (Appendix A).
- Keep it opt-in per person (button, not automatic per scan) to control spend.

**Effort:** 2–3 sessions (new API route + tool loop + UI). **Risk:** cost control, hallucination guard (require every claim to carry a fetched URL).

### Option 6 — FamilySearch Solution Provider application (the long game)
Free program; grants real access to the historical-records API (SSDI, census, immigration — everything the current code *pretends* to have). Requires: developer account → "Apply for Compatibility" → Compatible Product Affiliate Agreement + security assessment; a **registered legal business** is required for a production key / App Gallery listing. Weeks-to-months of process, but GraveLens is exactly the kind of app they certify.
**Action now:** create the free dev account (unblocks Option 2.3 immediately) and start the compatibility application in parallel. Don't build anything that *depends* on approval.

---

## Part 3 — Recommended sequencing

> **Progress (2026-07-11):** ✅ R1 complete (shared fetch client `src/lib/apis/client.ts`, per-source status in lookup response + `SourceStatusCard`, dead FS modules degraded with pre-filled web-search fallbacks, skill doc corrected). ✅ R2 complete (`src/lib/research/personQuery.ts` + `scoreCandidate`, wired into the lookup route; exact dates + co-buried people now sent from ResultPage). ✅ Part of R4 done early: Chronicling America migrated to the loc.gov API (verified live: 5 real 1922 Minnesota hits with highlighted page links). ✅ R4 caching done: shared per-person research cache (`grave_identity_index`, keyed by the identity layer, 365-day TTL, version-aware) — repeat scans of the same person by any user cost zero external API calls. ✅ New: `burial_index` table — every scan harvests the stone's public facts (name, dates, cemetery, GPS; no photos/notes/user id) into GraveLens' own pooled person database, with scan-count dedupe and fact back-filling (see supabase-schema.sql). Next: R3 deep-link panel, then remaining R4 (WikiTree, NARA key, archive.org), then serving burial_index matches as a research source.

| Phase | What | Options | Why first |
|---|---|---|---|
| **R1 — Triage (1 session)** | Add per-source status + logging via the shared fetch client; mark FamilySearch-API modules and chronicling.ts as `degraded`; stop rendering their empty sections as "no records found"; correct `.agent/skills/genealogical-apis/SKILL.md` (auth reality, loc.gov endpoint) | 2.4, 2.5 | Stops the app from lying about coverage; makes everything after measurable |
| **R2 — Precision core (3–4 sessions)** | `personQuery.ts` builder + `scoreCandidate` + name normalization dictionaries | 3 | Everything downstream consumes it |
| **R3 — Deep-Link First (2–3 sessions)** | Rebuild the research panel around parameterized links (FamilySearch web, FindAGrave, state records, draft cards, immigration collections), driven by R2 | 1 | Immediate, reliable, real research value |
| **R4 — Working APIs (3–4 sessions)** | loc.gov newspapers migration; NARA real key; WikiTree; archive.org; FS unauthenticated-session Person Search; Supabase result caching | 2, 4 | Restores inline results where genuinely possible |
| **R5 — Differentiators (parallel / later)** | State death-index ingestion (start with your home state); Claude Deep Research button (premium); FS Solution Provider application | 4, 5, 6 | In-app verified records + revenue feature |

**Bottom line:** R1–R3 alone turn GraveLens from "APIs that sometimes show something" into a genuinely dependable research launcher; R4–R5 progressively bring verified records back *inside* the app.

## Sources
- [FamilySearch — Authentication (OAuth2, unauthenticated-session scope)](https://developers.familysearch.org/main/docs/authentication)
- [FamilySearch — Getting Started / developer keys](https://developers.familysearch.org/main/docs/getting-started)
- [FamilySearch — Solution Provider / compatibility program](https://www.familysearch.org/innovate/api-key-management)
- [LoC — Chronicling America website migration notice](https://www.loc.gov/ndnp/migration/)
- [LoC — Chronicling America API deprecation → loc.gov API](https://www.loc.gov/apis/additional-apis/chronicling-america-api/)
- [LoC — loc.gov JSON API tutorial for Chronicling America](https://libraryofcongress.github.io/data-exploration/loc.gov%20JSON%20API/Chronicling_America/README.html)
- [WikiTree API docs (GitHub)](https://github.com/wikitree/wikitree-api)
- [WikiTree — API help/authentication](https://www.wikitree.com/wiki/Help:API_Documentation)
- [DeathIndexes.com — state-by-state open death indexes](https://www.deathindexes.com/)
- [Ohio History Connection — Ohio Death Record Index](https://resources.ohiohistory.org/death/)
