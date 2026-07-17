---
name: usage-tracking-estimator
description: How LowHigh-ecosystem AI usage logging and the token-usage estimator work. Read and apply BEFORE touching api_usage_log logging, usage_tracking_settings, the usage_by_app_component_filtered RPC, /api/usage-stats (or GraveLens /api/billing/usage-stats), or any TokenUsageBreakdown estimator UI. Covers the hard rules: direct-to-Supabase logging, is_enabled gating, app ordering, and tracking_start_at windows.
---

# Usage Tracking & the Token Estimator

The LowHigh ecosystem (lowhigh.ai core + satellite apps like GraveLens) shares ONE Supabase
project, ONE token ledger, and ONE usage table: `api_usage_log`. The token-usage estimator
(`TokenUsageBreakdown`) reads aggregates of that table to show users "how many uses you get"
per app/feature. These are the user's firm, repeatedly-stated rules. Follow them exactly.

## Rule 1 — Log every AI call DIRECTLY to Supabase (no bridge)

When any component uses an AI API, it MUST write the usage straight to `api_usage_log`,
**every call, every time**, using a server-side service-role client.

- **NO indirect routes.** Do not POST usage to another app's HTTP endpoint
  (`NEXT_PUBLIC_LOWHIGH_API_BASE/api/usage/log` or any cross-app bridge). Bridges silently
  no-op when the base URL is unset/unreachable and swallow errors, so usage never lands and
  the app stays invisible in the estimator. This was the GraveLens bug.
- The user has said this many times. Do not re-propose a bridge or argue. Direct insert only.

**Cost math** (single source of truth: `LowHigh Website/api/_utils/usageTracking.js`):
1. Read pricing from the `ai_models` table (`input_cost_per_1m`, `output_cost_per_1m`,
   `cost_per_query`). Cache per warm instance (~5 min TTL).
2. `estimated_cost` = input/output token cost, OR `queries × cost_per_query` for flat-rate
   services (e.g. TTS `tts-1`).
3. `lowhigh_tokens = round(estimated_cost × 1_000_000)` (1,000,000 LowHigh tokens = $1).
4. `model_id` only set if it exists in `ai_models` (else null — avoids FK violation).
5. Insert into `api_usage_log` with `app_slug` = the app's OWN slug (e.g. `'gravelens'`),
   plus `user_id`, `endpoint`, `provider`, `model`, `request_type`, `input_tokens`,
   `output_tokens`, `queries`, `estimated_cost`, `lowhigh_tokens`, `metadata`, `prompt_id`,
   `tool`, `component`. Fire-and-forget; never throw into the user's request.

`prompt_id` groups all AI calls in one user action (frontend-generated UUID). `tool` is the
mid-level grouping ("Scan", "Story"); `component` is the human UI label ("Analyze Marker").
See [[feedback_tool_component_hierarchy]] — `app_slug`/`component` describe the FRONTEND
feature, never a backend action name.

## Rule 2 — `is_enabled` controls which apps appear

`usage_tracking_settings` (PK `app_slug`) gates the estimator:
- `is_enabled = TRUE` → app is ELIGIBLE. `FALSE` or no row → hidden. This is the allowlist
  the user toggles to control the set.
- **Eligible ≠ shown.** The `usage_by_app_component_filtered` RPC only returns apps that have
  real `api_usage_log` rows in their tracking window. An enabled app with zero logged usage
  is correctly invisible. NEVER hardcode, seed, or force-inject an app to make it appear —
  that makes the numbers lie. If an app should show but doesn't, fix its logging (Rule 1).

## Rule 3 — App ordering in the estimator

The RPC does not order apps; the estimator component must sort the app groups:
1. **Current app pinned to top** — the app whose URL/context the user is on (GraveLens on a
   GraveLens URL). Pass the current `app_slug` into the component.
2. **Popularity, descending** — highest recent token usage first. Per-app weight ≈
   Σ (`avgTokens` × `totalPrompts`) across its components.
3. **Alphabetical** — final tiebreaker.

Tool/feature ordering within an app stays alphabetical unless told otherwise.

## Rule 4 — `tracking_start_at` window

Per-app column on `usage_tracking_settings`:
- **NULL → all time.** The app is omitted from the RPC's `start_filter`, so no date cutoff.
- **non-NULL → from that datetime forward.** Only `api_usage_log` rows with
  `created_at >= tracking_start_at` are counted.

This is enforced in the `usage_by_app_component_filtered` RPC
(`start_filter->>app_slug IS NULL OR l.created_at >= cutoff`) and in how `fetchUsageStats`
builds `start_filter` (only apps WITH a non-null `tracking_start_at`). Do not regress this.

## Key files

- `LowHigh Website/api/_utils/usageTracking.js` — canonical cost math + `api_usage_log` insert.
- `LowHigh Website/migrations/create_usage_tracking_settings.sql` — table + RPC (date window).
- GraveLens logging: `GraveLens/src/lib/lowhigh.ts` (`logUsage`), called from each AI route
  (`analyze`, `narrative`, `tts`, `story`, `cultural`). Uses `getServiceClient`.
- Estimator UI: `GraveLens/src/components/billing/TokenUsageBreakdown.tsx` and
  `LowHigh Website/src/components/usage/TokenUsageBreakdown.tsx`.
- Aggregation read path: GraveLens `src/lib/billingData.ts` `fetchUsageStats`; LowHigh
  `api/usage-stats.js`.
