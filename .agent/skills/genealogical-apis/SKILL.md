---
name: genealogical-apis
description: Reference guide for GraveLens' public API integrations, source-status conventions, and cross-validation rules.
---
<role>
You are a Lead Genealogist and Integration Engineer. You understand the nuances of various genealogical data sources, matching strategies, search parameters, and data verification patterns.
</role>

<execution_rules>
When adding, modifying, or debugging external API integrations or name search logic in GraveLens, you must strictly follow these integration formats and rules:

### 0. Mandatory Plumbing Conventions

* **Every external research call goes through `fetchSourceJson()` in `src/lib/apis/client.ts`** — timeout, one retry with jitter, and server-side failure logging. Bare `fetch` + `catch { return [] }` is a violation: it makes a broken API indistinguishable from "no records".
* **Person-record source modules return `SourceResult<T>`** (`{ status: "ok" | "empty" | "failed" | "unavailable", records, fallbackUrl? }`), never bare arrays. The lookup route aggregates these into `ResearchData.sourceStatus`, which `SourceStatusCard.tsx` renders so the user sees "source unavailable → direct search link" instead of a silently missing section.
* **All person searches consume the Identity Layer** (`src/lib/research/personQuery.ts`): `buildPersonQuery()` provides normalized given names (Wm.→William, nicknames→formal), maiden names, phonetic surname variants, exact stone dates (`death.iso`), GPS place chain, and spouse/co-buried disambiguators. `scoreCandidate()` is the single scoring function for match confidence — do not write per-source scorers.

### 1. API Endpoints & Request Specifications

* **⚠️ FamilySearch Platform API — DO NOT USE (verified dead July 2026)**
  * `api.familysearch.org/platform/records/search` returns **404 without an OAuth token**, and historical-records access is partner-gated even with one. There is **no free unauthenticated tier** — earlier versions of this skill claimed otherwise and were wrong.
  * The modules that rode on it (`familysearch.ts`, `ssdi.ts`, `immigration.ts`, `historicalCensus.ts`) now return `status: "unavailable"` plus a pre-filled **web search deep link** built by `buildFamilySearchWebUrl()` in `src/lib/apis/familysearch.ts`. The FamilySearch *web* search accepts the same `q.givenName` / `q.surname` / `q.birthLikeDate.from/to` / `q.deathLikeDate.from/to` / `q.residencePlace` / `f.collectionId` parameters and shows full records to signed-in free accounts.
  * Key collection IDs (used in deep links): SSDI `2437639`, WWI Draft Cards `1968530`, Ellis Island `1923067`, Castle Garden `1854451`, censuses 1880 `1417683` / 1900 `1325221` / 1910 `1727033` / 1920 `1488411` / 1930 `1452222` / 1940 `2000219`.
  * Restoring inline records requires a FamilySearch Solution Provider key — see RESEARCH_RELIABILITY_PLAN.md Option 6.

* **Historic Newspapers — loc.gov API (Chronicling America)**
  * The legacy `chroniclingamerica.loc.gov/search/pages/results` JSON API was **retired 2025-08-04 and 404s**. Use:
  * **Endpoint**: `https://www.loc.gov/collections/chronicling-america/?fo=json`
  * **Verified working params**: `q=<terms>` (quote for phrase), `dates=YYYY-MM-DD/YYYY-MM-DD` (day precision works), `fa=location_state:<lowercase full state>`, `c=<rows>`, `at=results,pagination` (trims 1.8 MB → 14 KB).
  * **Silently ignored params** (do not use): `qs=`, `ops=`, `start_date=`, `end_date=`, `location_state=` as bare params.
  * OCR text is in `results[].description[0]`; `results[].url` deep-links to the scanned page with the search term highlighted; newspaper name is `partof_title[0]`.
  * Coverage 1770–1963. For obituaries with an exact death date, search `deathDateIso` → +120 days.

* **OpenStreetMap (OSM) Overpass API**
  * **Endpoint**: `https://overpass-api.de/api/interpreter`
  * **Usage**: Fetch cemetery features within an `around` boundary (typically `around:800,lat,lng`).
  * **Tags to Match**: `landuse="cemetery"`, `amenity="grave_yard"`.
  * **Property Mapping**: `opening_hours`, `phone` / `contact:phone`, `website` / `contact:website` / `url`, `denomination` / `religion`, `start_date`, `wikipedia`, `wikidata`.

* **NARA Catalog API v2**
  * **Endpoint**: `https://catalog.archives.gov/api/v2`
  * **Usage**: Elasticsearch-backed search using full names and military keywords. ⚠️ Still on `DEMO_KEY` (shared per-IP quota on Vercel) — replace with a free api.data.gov key when touched.
  * **Important**: Indexes finding aids and series, not individuals — only useful for military records.
  * **Target Record Groups (RGs)**: RG 15 (VA pension files), RG 24 (Naval Personnel), RG 94 (Adjutant General, pre-WWII), RG 120 (AEF WWI), RG 407 (Adjutant General, WWII).

* **Wikidata SPARQL API**
  * **Endpoint**: `https://query.wikidata.org/sparql`
  * **Usage**: Retrieve notable figures and historical landmarks in map bounding boxes.

* **Ellis Island & Castle Garden** — no usable APIs; covered via FamilySearch collection deep links (see above).

* **Bureau of Land Management (BLM) GLO** — land patents by state and name (frontier era, pre-1940 deaths only).

### 2. Search Phonetics (`src/lib/phonetic.ts`)
* All name-based external searches must utilize surname phonetic codes generated by standard Soundex (4-character NARA-compatible) and Double Metaphone to widen queries and capture spelling mutations (e.g. Schmitt/Smith, Schmidt/Smyth). Access variants through `buildPersonQuery().surnames`, not by calling `variantsFor` directly in source modules.

### 3. Cross-Validation Matrix (implemented in `scoreCandidate`)
Cross-reference overlapping data from separate APIs to assess matching confidence:
1. **Name Matching**: Verify OCR name against record names. Surname Levenshtein > 3 chars ⇒ penalize; use formal-name expansions for given names.
2. **Birth/Death Years**: Gravestone vs. record years — ±1 strong, ±3 weak, >3 penalize.
3. **Location/Geography**: Cemetery GPS state vs. record state; a mismatch is a migration signal, not a disqualifier.
4. **Foreign Language / Inscription**: Non-English inscriptions (diacritics) trigger the immigration research path (`isLikelyImmigrant`).
5. **Spouse/co-burials**: On multi-person stones, the co-buried spouse is the strongest disambiguator — include in deep links where the target supports spouse parameters.
</execution_rules>
