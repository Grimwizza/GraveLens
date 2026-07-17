---
name: lowhigh-database-management
description: Read and follow BEFORE creating or renaming any Supabase table, column, RPC, index, or policy anywhere in the LowHigh ecosystem (LowHigh 1.0, LowHigh Website, GraveLens, Antisocial). Defines the one naming convention all four apps share, the domain glossary that keeps backend names matched to front-end labels, and the "introspect live schema first" rule. Use whenever a task adds a migration, a new table/column, or touches schema in the shared Supabase project.
metadata:
  type: reference
---

# LowHigh Database Management

All four LowHigh codebases (LowHigh 1.0, LowHigh Website, GraveLens, Antisocial) share **one
Supabase project**. Because the schema is a shared, single namespace, naming has to be deliberate:
a name is read by every app, not just the one that created the table. This skill is the convention
so it never has to be re-derived, and so backend names never drift from what users see in the UI.

> Companion reading: `lowhigh-ecosystem-topology` (how the apps/domains relate),
> `usage-tracking-estimator` (the usage/logging tables), `configure-tokens-and-payments` (billing
> tables). This skill governs *naming*; those govern *behavior*.

---

## 1. The namespacing rule (the one thing to remember)

**No prefix = LowHigh core.  A brand prefix = that specific app owns it.**

| Owner | Prefix | Examples |
|-------|--------|----------|
| LowHigh core platform (billing, tokens, rewards, usage, support, referrals, gifts, auth, catalog) | *none* | `rewards`, `token_balances`, `subscription_plans`, `api_usage_log`, `support_tickets` |
| GraveLens | `gravelens_` | `gravelens_scans`, `gravelens_user_profiles` |
| Antisocial | `antisocial_` | `antisocial_facts`, `antisocial_spark_balances` |

- Use the **full brand word**, not an abbreviation (`gravelens_`, not `gl_`).
- **Never stack ownership prefixes.** For an app-owned per-user table, the app prefix *replaces*
  any `user_` prefix: `antisocial_media_interactions`, never `antisocial_user_media_interactions`
  and never `user_anti_social_...`. The prefix plus a `user_id` column already scope it.
- **`user_` on core (unprefixed) tables:** keep it only where it reads naturally and adds meaning
  (a per-user record paired with a catalog/definition sibling): `user_subscriptions` (vs
  `subscription_plans`), `user_settings_*`, `user_referral_codes`, `user_app_entitlements`. Drop it
  when the base noun already implies per-user and a cleaner name exists (`user_goal_completions` ->
  `reward_claims`, `user_pins` -> `saved_items`). The test: does `user_` disambiguate or just add
  noise?
- If a table is genuinely shared across more than one app, it is core: no prefix. Decide ownership
  by grepping `.from('<table>')` across every app before you name it.

---

## 2. Table naming

- `snake_case`, lowercase, ASCII.
- **Number:** plural for row/entity collections (`rewards`, `challenges`, `predictions`,
  `gravelens_scans`). Single-purpose store tables carry a role-suffix noun instead of a plural:
  `_cache`, `_registry`, `_settings`, `_log`, `_stats`.
- **Family-stem grouping:** within an app, give related tables a shared stem so the alphabetized
  table list reads like a table of contents. Established families:
  - `antisocial_language_*` -> `profiles`, `tracks`, `vocab`, `weights`, `explanations`
  - `antisocial_news_*` -> `cache`, `topics`, `images`
  - `antisocial_puzzle_*` -> `results`, `stats`
  - `antisocial_spark_*` -> `balances`, `transactions`
  - `antisocial_feed_*` -> `views`, `snapshots`
- **Say what it holds, not how it is implemented.** `feed_snapshots`, not `session_bundle`;
  `news_images`, not `og_image_cache`.
- Junction tables: `<a>_<b>` (e.g. `plan_core_apps`).

---

## 3. Column naming

- `snake_case`, lowercase.
- **Primary key:** `id uuid DEFAULT gen_random_uuid()`. No TEXT ids, no `uuid_generate_v4()`.
  (Exception, decided case by case: an app-generated id that is load-bearing in a storage path may
  stay TEXT. Document why in the migration.) Composite natural keys are fine for join/cache tables,
  e.g. `PRIMARY KEY (user_id, lang, lemma)`.
- **Foreign keys:** `<referent_singular>_id`, referencing `<referent>(id)`: `user_id`,
  `reward_id`, `challenge_id`, `thread_id`, `plan_id`.
- **Timestamps:** always `timestamptz`. Never bigint-unix, never `date` for a moment in time.
  - Row lifecycle: `created_at`, `updated_at` (maintain `updated_at` with a trigger).
  - Domain events, past tense `<verb>_at`: `completed_at`, `resolved_at`, `verified_at`,
    `claimed_at`, `activated_at`, `deleted_at`, `archived_at`, `paused_at`.
  - Scheduling: `next_<verb>_at`, `last_<verb>_at`.
- **Booleans:** `is_<adj>` / `has_<noun>` / `can_<verb>`. Never a bare adjective or verb.
  (`is_correct`, not `correct`; `is_resolved`, not `outcome`; `is_verifiable`, not `verifiable`.)
- **Text enums:** name the column for the noun (`status`, `kind`, `type`, `source`) and always
  constrain it with `CHECK (col IN (...))`.
- **JSONB:** name by what it contains, not by its container. Reserve `metadata` for a genuine
  audit/misc bag. Avoid `data`/`payload`/`meta`/`score`/`bundle`/`setup`/`form` as column names;
  use `detail`, `stats`, `snapshot`, `interview_answers`, `form_state`, etc.
- **Money / tokens:** `bigint`/`integer` for token counts, `numeric` for currency; suffix units
  when ambiguous (`price_monthly`, `token_allowance`).
- **Arrays:** plural noun (`tags`, `visible_in_apps`).

---

## 4. Other database objects

| Object | Pattern | Example |
|--------|---------|---------|
| Primary key constraint | `pk_<table>` | `pk_rewards` |
| Foreign key | `fk_<table>_<col>` | `fk_challenges_user_id` |
| Unique | `uq_<table>_<cols>` | `uq_reward_claims_user_reward` |
| Check | `chk_<table>_<purpose>` | `chk_predictions_confidence_range` |
| Index | `idx_<table>_<cols>` | `idx_predictions_user_due` |
| Trigger | `trg_<table>_<action>` | `trg_challenges_set_updated_at` |
| RLS policy | `<table>_<action>_<scope>` | `challenges_select_own`, `rewards_select_public` |
| View | `v_<name>` | `v_token_balances` |
| Function / RPC | verb-first `snake_case`, params `p_<name>` | `claim_reward(p_user_id, ...)` |

- Standardize UUID generation to `gen_random_uuid()` everywhere.
- RPC names track the domain word. When a concept is renamed, the RPC follows: `claim_goal`
  became `claim_reward` when `goals` became `rewards`.

---

## 5. Match the front-end word (the anti-drift rule)

If users see a word for a thing, the table for that thing uses the same word. This is the rule that
keeps the database navigable to anyone who also knows the product. Before naming a **surfaced**
table, open the UI and check the label. Tables that are never surfaced (caches, weights,
interactions, registries) keep their developer term.

Confirmed alignments already applied (do not regress these):

| Front-end label | Table / concept | NOT |
|-----------------|-----------------|-----|
| "Rewards" (core `/rewards`, "Balance & Rewards") | `rewards`, `reward_claims`, `claim_reward()` | ~~goals~~ |
| "Scan" / "Archive" (GraveLens) | `gravelens_scans` | ~~graves~~ |
| "Facts" (Antisocial settings) | `antisocial_facts`, `fact_id` | ~~factoids~~ |
| "Journal" (Antisocial Progress tab) | `antisocial_journal_entries` | ~~notes~~ |
| "Saved" (Antisocial header) | `antisocial_saved_items` | ~~pins~~ |
| "Sparks" (Antisocial currency) | `antisocial_spark_balances`, `antisocial_spark_transactions` | ~~currency~~ |

---

## 6. Domain glossary (one canonical word per concept)

Reuse these words. Do not invent a synonym.

| Concept | Word | Notes |
|---------|------|-------|
| Claimable/earnable achievement | **reward** | core `rewards` table; UI says "Rewards" |
| Antisocial currency | **spark** | `antisocial_spark_*` |
| A scanned grave marker (GraveLens) | **scan** | UI "Scan"/"Archive" |
| A did-you-know card (Antisocial) | **fact** | UI "Facts" |
| A user note / check-in (Antisocial) | **journal entry** | UI "Journal" |
| A saved feed item (Antisocial) | **saved item** | UI "Saved" |
| A saved feed / topic list (Antisocial) | **feed view** | default view label is "For You" |
| A per-language progress row | **language profile** | |
| A frozen feed for instant load | **feed snapshot** | not "bundle" |
| Billing currency | **token** | UI "Tokens" |
| A paid tier | **plan** (tier level = `tier_level`) | UI shows tier names |
| A user bug/idea report | **ticket** | `support_tickets` |
| Invite-a-friend | **referral** | slug/category may differ; UI "Referrals"/"Invite" |
| Gift app access | **gift** | `token_gifts` |

Add a row here whenever you introduce a new user-facing concept.

---

## 7. Checklist: adding a new table

1. **Owner?** Grep `.from()` intent across apps. Core -> no prefix. One app -> `gravelens_` /
   `antisocial_`.
2. **Glossary + front-end word.** Is this concept already in section 6? Reuse the word. Is it
   surfaced in the UI? Match the label (section 5).
3. **Family stem.** Does it belong to an existing family (section 2)? Use the stem so it sorts with
   its siblings.
4. **Required columns:** `id uuid DEFAULT gen_random_uuid()` (or a documented composite key),
   `created_at timestamptz NOT NULL DEFAULT now()`, and `updated_at` if the row mutates.
5. **RLS + trigger:** enable RLS; add `<table>_<action>_<scope>` policies; add
   `trg_<table>_set_updated_at` if it has `updated_at`.
6. **Objects:** name every index/constraint per section 4.
7. **Booleans/timestamps/JSONB** follow section 3 (no bare booleans, always `timestamptz`,
   semantic JSONB names).

## Checklist: adding or renaming a column

1. Boolean -> `is_/has_/can_`. Timestamp -> `timestamptz` with a section-3 name. FK ->
   `<referent>_id`. JSONB -> semantic noun.
2. A rename cascades: update every `.from()`/select-string/filter/`.eq()`/insert payload, every
   TypeScript row type, and **every RPC body** that references it (see section 8).
3. If the concept is surfaced, confirm the column word matches the UI.

---

## 8. The drift rule (read before any migration on an existing table)

The repo `migrations/` folders are **historical and out of sync with live Supabase** (see project
memory `reference_db_schema_drift.md`; e.g. media interactions still use a legacy `tmdb_title_id`).
**Never** author a migration against an existing table from the migration files alone. Introspect
the live schema first and reconcile.

Introspection queries to run in the Supabase SQL editor (read-only):

```sql
-- columns
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- constraints (PK/FK/unique/check)
select tc.table_name, tc.constraint_type, tc.constraint_name, kcu.column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
where tc.table_schema = 'public'
order by tc.table_name, tc.constraint_type;

-- indexes
select tablename, indexname, indexdef
from pg_indexes where schemaname = 'public' order by tablename, indexname;

-- RLS policies
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- function / RPC bodies (plpgsql bodies are stored as text and do NOT auto-update on rename)
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by p.proname;
```

Two Postgres facts that matter for renames:
- Table renames auto-carry their FKs, indexes, and **views** (views track dependencies).
- **Function bodies do NOT** auto-update. Every RPC referencing a renamed table/column must be
  rebuilt with `CREATE OR REPLACE FUNCTION`, driven off the `pg_get_functiondef` dump. This is the
  sharpest correctness risk in any rename.

---

## 9. Where things live

- Core/shared migrations: `LowHigh Website/migrations/`
- GraveLens migrations + reconstructed reference schema:
  `GraveLens/db/migrations/`, `GraveLens/db/schema/gravelens_reference_schema.sql`
- Antisocial migrations: `Antisocial/migrations/`
- Client `.from()`/`.rpc()` call hubs: `Antisocial/api/_utils/*`, `Antisocial/api/*`,
  `GraveLens/src/lib/*`, `LowHigh Website/api/*` and `src/*`.
- Only edit `LowHigh Website/` (root `api/`/`src/` are stale copies that Vercel does not serve).

---

## 10. Reference artifacts (in `references/`)

These ship with the skill so any repo can continue the cross-app naming refactor:

- `references/DB_RENAME_MAP.md` — the canonical old→new name map for the ecosystem-wide rename
  (goals→rewards, graves→scans, factoids→facts, notes→journal_entries, pins→saved_items, etc.).
- `references/db_naming_bigbang.sql` — the idempotent big-bang rename migration. Run against the
  shared Supabase project **only after** a fresh live-schema introspection confirms current names
  (the repo `migrations/` folders are known to drift from live — see the "introspect first" rule).
- `references/db_security_advisor_fixes.sql` — Supabase security-advisor remediations (RLS/policy/
  search_path hardening) intended for the same shared project.
