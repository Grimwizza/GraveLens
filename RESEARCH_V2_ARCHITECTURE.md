# GraveLens Research v2 — Greenfield Architecture

**Premise:** Designing the research component from scratch. Assumptions: users are U.S.-based; coverage must span colonial-era through last-week burials; results must be *real, verifiable* data; per-scan cost as close to zero as possible.

Companion docs: [RESEARCH_RELIABILITY_PLAN.md](RESEARCH_RELIABILITY_PLAN.md) (diagnosis of the current system), [NATIVE_APP_PLAN.md](NATIVE_APP_PLAN.md) (monetization ties in via Tier 3).

---

## Design principle

U.S. genealogy sources sort cleanly into three kinds:
1. **Truly open data** (Library of Congress, NARA, Wikidata, WikiTree, archive.org, state open-records releases) — free APIs or bulk downloads that never gate.
2. **Account-gated giants** (FamilySearch, FindAGrave, Ancestry, Newspapers.com) — no usable free API, but excellent *web search pages that accept URL parameters*, and users can hold their own free (FamilySearch, FindAGrave) or paid accounts.
3. **The unindexed modern web** (post-1963 obituaries, funeral home pages, Legacy.com) — no API at any price; only reachable by an agent that searches the web like a human.

So the architecture is **three tiers matched to those three kinds**, with a shared identity layer underneath. Nothing in Tier 1 or 2 costs money per scan or can silently rot into a paywall.

```
             ┌────────────────────────────────────────────┐
             │  Identity Layer: PersonQuery + MatchScore  │  ← one module feeds everything
             └────────────────────────────────────────────┘
   Tier 1 (inline, instant, $0)      Tier 2 (link-outs, $0)      Tier 3 (on-demand, paid)
   ─ Owned death index (Supabase)    ─ FamilySearch web deep      ─ Claude "Deep Research"
   ─ loc.gov newspapers ≤1963          links (per collection)       agent w/ web search:
   ─ WikiTree profiles               ─ FindAGrave / BillionGraves    modern obituaries,
   ─ NARA catalog (military)         ─ State vital-records sites     candidate verification
   ─ Wikidata/Wikipedia context      ─ Ancestry/Newspapers.com
   ─ BLM GLO land patents              (labelled "paid account")
```

---

## The Identity Layer (build first — everything depends on it)

`buildPersonQuery(record)` — normalizes what the stone gave us into search-ready form:
- Given-name expansion: `Wm.`→William, `Jas.`→James, nicknames (Mollie/Mary, Peggy/Margaret) via public-domain dictionaries.
- Surname phonetic fan-out (the existing `phonetic.ts` Soundex/Metaphone, actually wired into queries).
- Maiden-name parsing (`née X`, "formerly X") → alternate surname.
- Exact dates preserved (day/month when the stone has them), plus fallback windows.
- Place chain from cemetery GPS: state / county / city (burial place ≈ death place — the strongest free prior we have).
- Co-buried people & spouse from multi-person stones as disambiguators.

`scoreCandidate(candidate, query)` — one scoring function used by every source: name distance, date deltas, place agreement → high/medium/low + a plain-English "matched on exact death date + county" explanation shown in the UI. Real data means the user can see *why* we believe it's the right person.

---

## Tier 1 — Inline results (free, reliable, real data)

| Source | Coverage | Why it earns a slot |
|---|---|---|
| **Owned death index** (state open data ingested into Supabase Postgres) | Varies by state; e.g. OH 1908–1963, MI 1897–1943, MO, WV, NC, MD certs 1898–2012 (Reclaim the Records) | The crown jewel: exact-match death records served from our own DB — instant, never breaks, no rate limits. Start with the 2–3 states where scanning actually happens; add states by demand. This is the only way to get *verified vital records inline* without a partner agreement. |
| **loc.gov Chronicling America API** | Newspapers 1770–1963 | Obituaries + real name mentions with OCR snippets. The single best "real data" hit for older graves. Free, official, JSON. |
| **WikiTree API** | Any era, ~30M profiles | "Someone already researched this person" — sourced facts, family links. Free, no auth for public profiles. |
| **NARA Catalog API** (real api.data.gov key) | Military series, pensions | Only fired when the stone shows military indicators (current gating logic is right). |
| **Wikidata / Wikipedia / NRHP / Census pop.** | Context | Keep as-is — these already work and make results feel rich. |
| **BLM GLO land patents** | Frontier era, pre-1940 | Keep; already era-gated correctly. |

Plumbing rules (non-negotiable this time): shared fetch client with timeout + one retry + per-source telemetry; every source returns `ok | empty | failed` and the UI renders "source unavailable — use the direct link" for `failed`; successful person-results cached in Supabase keyed by identity hash so repeat lookups are free and outage-proof.

## Tier 2 — Precision deep links (free, cover everything the APIs can't)

One "Research this person" panel, every link pre-filled by the Identity Layer, grouped by record type, era-filtered so users only see links that can plausibly hit:

- **FamilySearch web search** — the workhorse. Collection-scoped URLs (SSDI 2437639, 1900–1950 censuses, WWI/WWII draft cards, Ellis Island, Castle Garden, naturalization, state death collections) with full params: names, date ranges, `q.deathLikePlace`, spouse. Free account shows full records. This replaces the four dead API modules with something *more* capable.
- **FindAGrave search** — burial cross-reference, family plot discovery, existing memorials/photos. Era-universal; often the best source for post-2000 deaths.
- **State vital-records / archives links** (the existing 50-state table in `researchLinks.ts`, kept and fed better params).
- **BillionGraves**, **Ancestry**, **Newspapers.com** (badged "paid account required" so expectations are set).

Deep links are a *feature*, not a fallback: GraveLens's differentiator is the aiming — no genealogy site knows the exact stone, GPS, co-burials, and OCR'd dates. Nail the aim and the user's first click lands on the record.

## Tier 3 — Claude "Deep Research" agent (opt-in, the only paid piece)

A per-person button, not automatic. Server route where Claude + web search does what no API can:
- **Modern obituaries (1964–present)** — Legacy.com, funeral home sites, local news. This is the entire coverage answer for newer graves, and there is no API alternative at any price.
- Candidate verification: cross-check Tier 1/2 candidates, then return a short narrative where **every claim carries a source URL** (hard requirement — reject unsourced output).
- Cost ~$0.05–0.30/run → natural premium feature / daily quota (ties into NATIVE_APP_PLAN Appendix A monetization).

---

## Coverage map by death era (the "newer and older graves" check)

| Death era | Inline (Tier 1) | Links (Tier 2) | Agent (Tier 3) |
|---|---|---|---|
| Pre-1850 | ChronAm, WikiTree, archive.org county histories | FS colonial/church collections, FindAGrave | rarely needed |
| 1850–1900 | ChronAm obits, BLM patents, WikiTree, state indexes (some) | FS censuses 1850–1900, immigration collections, state archives | rarely |
| 1900–1963 | **Strongest band:** ChronAm obits, state death indexes, NARA military | FS censuses 1900–1950, WWI/WWII draft cards, SSDI (1936+) | optional |
| 1964–2014 | SSDI-era state indexes where open, WikiTree | **SSDI via FS link**, FindAGrave, state records | obituary agent shines |
| 2015–now | (almost nothing open exists) | FindAGrave, Google News link | **agent is the only real source** |

Every era has at least one real-data path; the thin band (2015+) is exactly where the paid agent carries it — which is also the band users with recent-loss emotional investment are most willing to pay for.

## Cost model

- Tier 1: $0/scan (open APIs + own Postgres). One-time ingestion effort per state index.
- Tier 2: $0 forever.
- Tier 3: user-triggered, quota-capped, ~pennies per run — chargeable.
- Infra: state indexes are tens of millions of rows max — comfortably inside Supabase's free/low tiers with proper indexes (trigram on names, btree on year+state).

## Build order (greenfield)

1. Identity Layer (`personQuery.ts` + `scoreCandidate`) — 3–4 sessions
2. Tier 2 deep-link panel driven by it — 2 sessions
3. Shared fetch client + loc.gov + WikiTree + NARA key inline — 3 sessions
4. First state death index ingestion (home state) — 2 sessions
5. Tier 3 agent + quota — 2–3 sessions
6. (Parallel, free option) FamilySearch Solution Provider application — if ever approved, FS records move from Tier 2 into Tier 1 with zero rearchitecture, because everything consumes the same PersonQuery/score interfaces.
