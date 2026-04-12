# GraveLens — Genealogical Research Roadmap
### Product Brief · April 2026

---

## Executive Summary

GraveLens is a PWA that captures gravestone photos, performs AI-powered OCR extraction (Claude Haiku/Sonnet), and enriches the result with a disciplined stack of **nine free public APIs**:

| Current Integration | Source | What It Provides |
|---|---|---|
| `cemetery.ts` | OpenStreetMap Overpass + Wikipedia | Cemetery metadata, denomination, founding |
| `military.ts` | Static template library | Conflict context from inscription keywords + birth year |
| `nara.ts` | NARA Catalog API v2 | Finding-aid-level archive records (RGs 15, 24, 94, 120, 407) |
| `blm.ts` | BLM GLO Records | Land patents by name + state |
| `chronicling.ts` | Chronicling America (LOC) | Obituaries + local news, 1770–1963 |
| `census.ts` | Census Bureau API | County populations, 1990–2020 |
| `localHistory.ts` | Wikipedia + Wikidata + NRHP | Decade snapshots, nearby landmarks |
| `symbols.ts` | Static curated DB | 35+ symbol interpretations |
| `wikidata.ts` / `wikipedia.ts` | Wikidata SPARQL + Wikipedia REST | Notable figures, historical events |

The platform's data model (`GraveRecord`) is solid. The `research` JSONB blob is flexible enough to absorb all proposed additions without a schema migration.

---

## Gap Analysis — Professional Researcher Perspective

A professional genealogist hits six hard walls with the current tool:

| # | Gap | Root Cause |
|---|---|---|
| G1 | **No vital records cross-reference** | No death certificate / state index integration |
| G2 | **No Social Security Death Index (SSDI) lookup** | Missing FamilySearch or SSDI API bridge |
| G3 | **Census coverage stops at 1990** | Census API gap; pre-1990 needs a different strategy |
| G4 | **Surname variant / phonetic search is absent** | All name lookups are exact-match strings |
| G5 | **No FamilySearch tree collision detection** | No hint that a person may already be indexed |
| G6 | **Military records stay at the series level** | NARA search returns finding aids, not individual records |
| G7 | **No immigration / naturalization trace** | Ellis Island, passenger lists, and NARA RG 85 untouched |
| G8 | **Brick-wall assists are passive** | Research results are displayed; no guided "what to try next" |

---

## Feature Recommendations (Priority Order)

> **Effort key:** 🟢 Low · 🟡 Medium · 🔴 High  
> **Value key:** ⭐ Good · ⭐⭐ High · ⭐⭐⭐ Critical brick-wall solver

---

### F1 — FamilySearch Public Record Hints
**🟢 Effort · ⭐⭐⭐ Value**

**Description:** After every scan, silently query the FamilySearch Records API for the extracted name + birth/death year. Surface up to 3 collection "hints" — collection name, record type, years covered, and a deep link. No tree data is accessed; this stays within the free unauthenticated tier.

**Researcher Value:**  
FamilySearch is the single largest free genealogical database on earth (over 9 billion indexed records). A hint that a matching record exists in "Iowa, Death Records, 1921–1940" tells a researcher exactly which county register to order. This alone breaks more brick walls than any other single integration.

**Implementation Strategy:**  
- New file: `src/lib/apis/familysearch.ts`  
- Endpoint: `https://api.familysearch.org/platform/records/search` (unauthenticated, GEDCOM X-JSON)  
- Query params: `q.givenName`, `q.surname`, `q.deathYear`, `q.birthYear`  
- Return type: `FamilySearchHint[]` → added to `ResearchData`  
- New field in `types/index.ts`: `familySearchHints?: FamilySearchHint[]`  
- Cache hints in existing `grave_identity_index` (append to `research_snapshot`)

**Public Data Source:**  
`https://api.familysearch.org/platform/records/search` — free, no API key required for public record discovery (OAuth only required to view restricted records).

**Cross-Validation:**  
Compare hint collection date ranges against OCR-extracted death year. Flag hints whose date range misses the extracted death year by >10 years as `lowConfidence: true`.

---

### F2 — Soundex / Metaphone Phonetic Name Normalization
**🟢 Effort · ⭐⭐⭐ Value**

**Description:** Before firing any name-based API call (NARA, BLM, Chronicling America, FamilySearch), generate and store the Soundex + Double Metaphone codes for the extracted surname. Use these codes to widen all downstream searches and flag near-matches.

**Researcher Value:**  
Immigrant surnames were routinely misspelled by census takers, enumerators, and stonecutters. "Schmitt" appears as "Smith," "Schmidt," "Smit," and "Smyth" across the same family's records. Without phonetic normalization every exact-match search misses the majority of genuine hits. This is the single most impactful zero-cost code change.

**Implementation Strategy:**  
- New file: `src/lib/phonetic.ts`  
- Implement standard Soundex (4-char, NARA-compatible) + simplified Double Metaphone  
- Expose `getSoundex(name: string): string` and `getMetaphone(name: string): string[]`  
- Update `ExtractedGraveData` to add `surnameSoundex?: string` and `surnameMetaphone?: string[]`  
- Thread these into BLM, NARA, and Chronicling America query builders as `OR` variants  
- Store in `grave_identity_index.identity_hash` inputs (hash on Soundex instead of raw name for fuzzy dedup)

**Public Data Source:**  
No external source needed — pure algorithm. Soundex is the same algorithm NARA uses internally for its own microfilm indexes.

**Cross-Validation:**  
When a phonetic variant match is returned, display it with a ⚠️ badge: *"Name on record: 'Schmitt' — possible variant of 'Schmidt'."* Let the researcher confirm or dismiss.

---

### F3 — State Death Index Integration via SSDI / Ancestry Free Workaround
**🟡 Effort · ⭐⭐⭐ Value**

**Description:** For deaths from 1936–2014, query the **Social Security Death Index** (SSDI) via FamilySearch's free search API (FamilySearch hosts the full SSDI publicly). For pre-1936 deaths, fall back to state-level death registers on FamilySearch's open collection index to identify which register to consult.

**Researcher Value:**  
The SSDI provides SSN, last known zip code, and last benefit state — this is the fastest way to confirm a death date, locate living relatives in adjacent records, and determine which state's vital records office holds the death certificate. Without this, researchers must contact every potential state blindly.

**Implementation Strategy:**  
- Extend `familysearch.ts` with a dedicated `searchSSDI(name, deathYear)` function  
- FamilySearch collection ID for SSDI: `https://api.familysearch.org/platform/collections/2437639` (Social Security Death Index)  
- Return: `SSDIRecord { ssn?: string, lastResidence?: string, lastBenefitState?: string, deathDate?: string }`  
- SSN is **never displayed** — used only to confirm identity match strength  
- New type: `SSDIRecord` in `types/index.ts`  
- Add to `ResearchData.vital?: VitalRecord[]` (new field)

**Public Data Sources:**  
- SSDI via FamilySearch API (free, unauthenticated): `https://api.familysearch.org/platform/records/search?collection=2437639`  
- State death index collections on FamilySearch (free, unauthenticated public collections)

**Cross-Validation:**  
Compare returned death date against OCR-extracted death date. Flag matches where dates differ by >1 year. If last-residence state differs from cemetery GPS state, surface a note: *"Last known residence: Iowa — buried in Wisconsin. Consider migration research."*

---

### F4 — Pre-1990 Historical Census via HeritageQuest / Archive.org
**🟡 Effort · ⭐⭐ Value**

**Description:** The current `census.ts` stops at 1990 via the Census Bureau API. For researchers, the vital census years are **1880, 1900, 1910, 1920** — the golden age of enumeration. Bridge this gap using the **FamilySearch Census Collections** search API (1880 census is fully indexed and freely searchable) and the **IPUMS NHGIS** for aggregate county-level historical population data.

**Researcher Value:**  
Finding a person in the 1880 or 1910 census with a name match from the gravestone provides household composition, occupation, birthplace, parents' birthplaces, and neighbors — solving 4-5 research steps in one query. County population context from 1870–1940 shows whether the community was a boom town or a rural outpost, setting migration expectations.

**Implementation Strategy:**  
- Extend `census.ts` with `searchHistoricalCensus(name, birthYear, state)` → calls FamilySearch census collections  
- For aggregate county population (no name search): call **NHGIS Data API** (`https://api.nhgis.org/`) — free with email registration, returns county population for every census year from 1790  
- Update `CensusEntry` type to add `source: "modern" | "historical" | "nhgis"` and `noteworthy?: string`  
- Cache in `local_history_cache` table (already exists, just add `historical_census` key)

**Public Data Sources:**  
- FamilySearch Census 1880 (free, public): `https://api.familysearch.org/platform/collections/1417683`  
- FamilySearch Census 1900–1940 (free, public): individual collection IDs per decade  
- NHGIS Data API (free with registration): `https://api.nhgis.org/metadata/` for time-series county population  
- IPUMS aggregate tables (free download, pre-cached on our server for the 50 states)

**Cross-Validation:**  
When a census record name match is found, compute age from the record against the gravestone birth year. Flag discrepancies >2 years. Display neighbors' surnames as a "cluster" — useful for identifying communities of origin.

---

### F5 — Immigration / Naturalization Record Links (Ellis Island + NARA RG 85)
**🟡 Effort · ⭐⭐⭐ Value**

**Description:** For persons born outside the US or with foreign-born parents (inferred from cemetery denomination, surname phonetics, or inscription language), query the **Castle Garden / Ellis Island databases** and NARA's RG 85 (Immigration and Naturalization Service) for passenger and naturalization records.

**Researcher Value:**  
Immigration is genealogy's hardest brick wall. Ship manifests from 1895–1957 contain: exact hometown in the country of origin, name of US contact (often a relative already here), occupation, physical description, and ticket purchaser. A single Ellis Island hit turns a one-line gravestone into a traceable European family tree.

**Implementation Strategy:**  
- New file: `src/lib/apis/immigration.ts`  
- Data sources (all free, no key required):  
  - **Statue of Liberty–Ellis Island Foundation**: `https://heritage.statueofliberty.org/passenger` (HTML scrape via proxy route, or use their unofficial JSON endpoint)  
  - **Castle Garden** (pre-Ellis Island, 1820–1892): `https://www.castlegarden.org/` (HTTP search)  
  - **FamilySearch Passenger Records**: `https://api.familysearch.org/platform/records/search?q.collectionId=1849782`  
- Trigger logic: fire only when `inscription` contains non-English text, surname phonetics suggest non-Anglo origin, or `cemetery.denomination` indicates Catholic/Jewish/Lutheran tradition  
- Return type: `ImmigrationRecord { shipName?, arrivalYear?, departurePort?, arrivalPort?, hometown?, contactName?, documentUrl? }`

**Public Data Sources:**  
- Ellis Island (1892–1957): searchable via Foundation API — free  
- Castle Garden (1820–1892): `castlegarden.org` — free  
- FamilySearch Immigrant Passenger Records: free, unauthenticated  
- NARA RG 85 finding aids: already accessible via existing `nara.ts` with `recordGroupNumber=85`

**Cross-Validation:**  
Cross-reference arrival year against birth year (should be age 5–50 at arrival). Cross-reference surname spelling on ship manifest against gravestone — document variant spellings for phonetic search. If hometown is identified, note the modern country and link to Wikipedia article on that region.

---

### F6 — Veteran Record Deep-Link (NARA Online Records + Military Index)
**🟡 Effort · ⭐⭐ Value**

**Description:** The current `nara.ts` returns **series-level** finding aids (e.g., "WWII Enlistment Records RG 407"). Upgrade to surface **item-level** military records that are already digitized and publicly available: WWII Army Enlistment Records (full free database), Korean War and Vietnam casualty files, and the Civil War Pension Index.

**Researcher Value:**  
Series-level hits tell a researcher a record *might* exist. Item-level hits tell them it *does* exist with a direct PDF link. Enlistment records add: rank at enlistment, civilian occupation, education, race, birthplace, and physical description. A single WWII enlistment record can confirm an identity that a gravestone OCR can only suggest.

**Implementation Strategy:**  
- Extend `nara.ts` with `searchEnlistmentRecords(name, birthYear, conflict)` → queries:  
  - WWII Army Enlistment Records: `https://aad.archives.gov/aad/record-detail.jsp?dt=893` (AAD System, free)  
  - Vietnam Casualty Search: `https://www.archives.gov/research/military/vietnam-war/casualty-statistics` (direct CSV via data.gov: `https://catalog.data.gov/dataset/veterans-statistics`)  
  - Civil War Pension Index: FamilySearch collection `https://api.familysearch.org/platform/collections/1932460`  
- Add `itemLevelRecords?: NaraItemRecord[]` to `ResearchData.naraRecords`  
- New type: `NaraItemRecord extends NaraRecord { pdfUrl?: string, rank?: string, occupation?: string, birthplace?: string }`

**Public Data Sources:**  
- NARA Access to Archival Databases (AAD): https://aad.archives.gov — free, no key  
- NARA data.gov datasets: https://catalog.data.gov/organization/nara — free, downloadable  
- FamilySearch Civil War Pension Index: free, unauthenticated  
- Vietnam Veterans Memorial Fund Wall search: `https://www.vvmf.org/database/` — free

**Cross-Validation:**  
Match returned enlistment `birthplace` against census-derived county. Match occupation against BLM land patent location (farmers frequently have adjacent land patents). Flag any birth year discrepancy >3 years between marker and enlistment record — this is a common identity-confirming data point.

---

### F7 — Probate & Land Record Expansion (USGenWeb Archives)
**🟡 Effort · ⭐ Value**

**Description:** USGenWeb Archives hosts transcribed county deed books, probate records, and will abstracts submitted by volunteers — organized by state and county. Augment the existing BLM GLO integration with a direct USGenWeb county index lookup to surface probate abstracts and deed book references.

**Researcher Value:**  
A will names heirs directly. A deed book shows land transfers to children. Probate records often list every living child (and their married names) at the time of death — these are frequently genealogy's most complete family reconstructions, predating vital records by decades. Most relevant for 1820–1920 deaths in rural counties.

**Implementation Strategy:**  
- New file: `src/lib/apis/usgenweb.ts`  
- USGenWeb counties are indexed at `https://usgwarchives.net/` with county-level text indexes  
- Query strategy: fetch `https://usgwarchives.net/{state}/{county}/` (free HTML), parse `<a>` tags for "probate", "deed", "will" sections, return as `UsGenWebRecord[]`  
- Fire only when BLM GLO returns a land patent (confirms rural property holder)  
- Cache results in `local_history_cache` under a new `usgenweb_records` key

**Public Data Source:**  
USGenWeb Archives (https://usgwarchives.net/) — entirely free, volunteer-maintained, no API key.

**Cross-Validation:**  
Cross-reference probate heir names against the `people[]` array on multi-person markers (joint headstones of husband + wife). Match deed book grantee surnames against Chronicling America obituary results.

---

### F8 — "What To Research Next" Guided Brick-Wall Assistant
**🟡 Effort · ⭐⭐⭐ Value**

**Description:** After all research APIs complete, run a deterministic scoring pass that evaluates which research avenues remain un-tried or returned zero results, then generate a prioritized "Research Checklist" shown in the result view. No AI call required — pure rule-based logic.

**Researcher Value:**  
The current platform presents results passively. A researcher looking at zero newspaper results for a 1942 death doesn't know if that means the person wasn't in the paper or if a slightly different name spelling would surface a result. The checklist bridges the gap between "here's what we found" and "here's what you should do next."

**Implementation Strategy:**  
- New file: `src/lib/researchChecklist.ts`  
- Input: `ResearchData + ExtractedGraveData + GeoLocation`  
- Rules engine examples:
  - If `militaryContext` exists AND `naraRecords.length === 0` → add: *"Request pension file: Write to NARA RG 15 for [conflict] pension."*  
  - If `deathYear > 1936` AND no SSDI hit → add: *"Search SSDI by SSN range for [state], [year]."*  
  - If `landRecords.length > 0` AND `deathYear < 1920` → add: *"Check county probate court for will — land owner likely left estate record."*  
  - If inscription is non-English → add: *"Trace European vital records via FamilySearch [detected language country]."*  
  - If `birthYear < 1870` → add: *"Pre-1870 census not yet indexed — check Ancestry.com free library edition or your local LDS Family History Center."*  
- Return type: `ResearchChecklist { items: ChecklistItem[] }` where `ChecklistItem { priority: 1|2|3, action: string, source: string, url?: string }`

**Public Data Source:**  
No external source — derives from existing API results.

---

### F9 — FamilySearch Open API Tree Collision Detection
**🔴 Effort · ⭐⭐ Value**

**Description:** After extracting name + birth/death year, ping the FamilySearch Persons API to check whether a matching person already exists in the public Family Tree. Return a `treeHit` flag — not the tree data itself, just confirmation that a person with those identifiers is already documented.

**Researcher Value:**  
If a person is already in the FamilySearch tree with 20 sources attached, the researcher should know immediately — it means someone has already done the work and the researcher can merge / verify rather than start from zero. This is the difference between a 20-hour research project and a 20-minute verification.

**Implementation Strategy:**  
- Extend `familysearch.ts` with `checkTreeCollision(name, birthYear, deathYear): Promise<{ hit: boolean, pid?: string, confidence: number }>`  
- FamilySearch Person Search: `https://api.familysearch.org/platform/tree/search` — requires OAuth 2.0 unauthenticated app registration (free)  
- Display a non-intrusive badge on the result card: *"Person may already be documented in FamilySearch Family Tree → View"*  
- **Important:** Link to FamilySearch search results page, never directly to a PID (avoids merging liability)

**Public Data Source:**  
FamilySearch Platform API (free app registration): https://www.familysearch.org/developers/

**Cross-Validation:**  
Only surface `hit: true` when confidence ≥ 0.7 (name + birth year within ±2 years both match). Avoid false positives — a wrong PID link erodes researcher trust instantly.

---

### F10 — Sanborn Map Direct Viewer Integration
**🟢 Effort · ⭐ Value**

**Description:** The `LocalHistoryContext` type already has a `sanbornMapUrl` field. Currently it is not displayed anywhere in the UI. Wire it up: when a Sanborn URL is present, render a thumbnail link to the Library of Congress Sanborn Map viewer for the city/decade corresponding to the person's lifespan.

**Researcher Value:**  
Sanborn fire insurance maps (1867–1970) show block-level building layouts for more than 12,000 American towns. Researchers use them to locate the exact house where a subject lived, identify neighbors, and confirm addresses from census records. A clickable link from the result view requires no new API work — the data is already being fetched.

**Implementation Strategy:**  
- No new API needed — `sanborn.ts` already fetches the URL  
- UI change only: in `src/components/results/`, add a `SanbornMapCard` component  
- Display: city name, decade range, and a thumbnail from the LOC viewer URL  
- LOC IIIF thumbnail pattern: `https://tile.loc.gov/image-services/iiif/{resource}/full/256,/0/default.jpg`

**Public Data Source:**  
Library of Congress Sanborn Maps (https://www.loc.gov/collections/sanborn-maps/) — free, no key.

---

## Prioritized Roadmap Summary

| Rank | Feature | Effort | Value | Ships In |
|---|---|---|---|---|
| 1 | F2 — Phonetic Name Normalization | 🟢 Low | ⭐⭐⭐ | Sprint 1 |
| 2 | F1 — FamilySearch Record Hints | 🟢 Low | ⭐⭐⭐ | Sprint 1 |
| 3 | F10 — Sanborn Map Viewer | 🟢 Low | ⭐ | Sprint 1 |
| 4 | F8 — Research Checklist | 🟡 Medium | ⭐⭐⭐ | Sprint 2 |
| 5 | F3 — SSDI Integration | 🟡 Medium | ⭐⭐⭐ | Sprint 2 |
| 6 | F5 — Immigration Records | 🟡 Medium | ⭐⭐⭐ | Sprint 3 |
| 7 | F4 — Historical Census (1880–1940) | 🟡 Medium | ⭐⭐ | Sprint 3 |
| 8 | F6 — NARA Item-Level Military | 🟡 Medium | ⭐⭐ | Sprint 4 |
| 9 | F7 — USGenWeb Probate | 🟡 Medium | ⭐ | Sprint 4 |
| 10 | F9 — FamilySearch Tree Collision | 🔴 High | ⭐⭐ | Sprint 5 |

---

## Cross-Validation Matrix

The table below shows which data sources can confirm each other's accuracy — the foundation of reliable forensic genealogy.

| Claim Source | Confirms With | Conflict Flag |
|---|---|---|
| Gravestone OCR name | SSDI name, FamilySearch census name | >3-char edit distance → warn |
| Gravestone birth year | Census age, SSDI birth year, enlistment record | >2-yr difference → flag |
| Cemetery GPS state | BLM patent state, SSDI last-residence state | Different state → note migration |
| Military inscription | NARA record group, FamilySearch military collection | No record → note unit/regiment unknown |
| Non-English inscription | Immigration record homeland | Language match → improve confidence |
| Death year | Chronicling America obit window, SSDI death date | >1-yr difference → flag |
| Land patent location | Census county, probate court county | Same county → confirm settlement pattern |

---

## Free Data Sources Reference

| Source | URL | Key Required | Coverage | Notes |
|---|---|---|---|---|
| FamilySearch Records API | api.familysearch.org | No (public) | 9B+ records | OAuth only for restricted content |
| SSDI via FamilySearch | api.familysearch.org collection 2437639 | No | 1936–2014 | SSN suppressed by FamilySearch |
| Ellis Island Foundation | heritage.statueofliberty.org | No | 1892–1957 | Ship passenger records |
| Castle Garden | castlegarden.org | No | 1820–1892 | Pre-Ellis Island arrivals |
| NARA Catalog v2 | catalog.archives.gov/api/v2 | No (DEMO_KEY) | All holdings | Item-level for digitized series |
| NARA AAD System | aad.archives.gov | No | Selected datasets | WWII enlistment, etc. |
| BLM GLO Records | glorecords.blm.gov | No | 1776–present | Land patents |
| Chronicling America | chroniclingamerica.loc.gov | No | 1770–1963 | Newspaper full-text |
| Library of Congress Sanborn | loc.gov/collections/sanborn-maps | No | 1867–1970 | Fire insurance maps |
| USGenWeb Archives | usgwarchives.net | No | Varies by county | Volunteer transcriptions |
| NHGIS Data API | api.nhgis.org | Email registration | 1790–present | Aggregate census data |
| Census Bureau Geocoder | geocoding.geo.census.gov | No | Current | FIPS from coordinates |
| OpenStreetMap Overpass | overpass-api.de | No | Current | Cemetery OSM tags |
| Wikidata SPARQL | query.wikidata.org | No | Open | Historical events, figures |
| Wikipedia REST | en.wikipedia.org/api/rest_v1 | No | Open | Cemetery descriptions |

---

*Brief prepared April 2026. All data sources verified free as of this date.*
