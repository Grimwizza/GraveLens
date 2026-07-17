# Shared backend checklist

Most of this **already exists** in the shared Supabase (created for LowHigh/GraveLens). Verify
before running anything — repo `migrations/` can drift from live (introspect live first). Only
emit SQL (output list B) for what's genuinely missing or new.

## Tables (should already exist)

- `token_balances` (per-user: allocated/purchased/rollover/used_tokens, period_start/end) + view
  `v_token_balances` (adds `available_tokens`).
- `token_transactions` (append-only ledger: id, type in
  allocation|rollover|top_up|debit|refund|bonus|gift|adjustment, amount signed, balance_after,
  stripe_payment_intent_id, description, metadata, created_at). RLS: users read own.
- `subscription_plans` (needs `tier_level` + `stripe_price_id_monthly`/`_annual` — the checkout route
  reads tier via these to decide upgrade vs downgrade), `token_top_up_packages`, `user_subscriptions`
  (needs `cancel_at_period_end` + `canceled_at` columns for the in-app cancel/resume flow; the pending
  *downgrade* is NOT stored here — it's read live from the Stripe schedule).
- `api_usage_log` (one row per AI call; `lowhigh_tokens numeric` = normalized cost).
- `stripe_processed_events` (webhook idempotency by event id).
- `goals` + `user_goal_completions` (rewards; goals gated per app by a `visible_in_apps` column).
- `lowhigh_admins` (bypass_billing).

**Introspect:** `select tablename from pg_tables where schemaname='public';` and
`select oid::regprocedure from pg_proc where proname = ANY(ARRAY['apply_topup','apply_monthly_token_reset','apply_upgrade_proration','settle_token_usage','reserve_tokens','release_tokens','usage_by_month','usage_summary_since','recent_usage_actions','claim_goal','complete_referral','record_subscription_state']);`

## RPCs (should already exist; canonical source in `LowHigh Website/migrations/`)

| RPC | Source file | Role |
|---|---|---|
| `apply_topup(user, tokens, usd, pi[, tx_type])` | `add_rollover_helpers.sql` / `create_gift_helpers.sql` | Credit purchased tokens on top-up/gift. **Only ONE overload may exist** (PGRST203 if two — see gotchas). |
| `apply_monthly_token_reset(user, period_start, period_end)` | `fix_monthly_reset_ledger.sql` (canonical, has idempotency guard, no rollover row, `expired_tokens` metadata) | Grant monthly allowance + rollover on sub create/renew. Idempotent per period → **cannot** top up a mid-cycle upgrade (that's `apply_upgrade_proration`). |
| `apply_upgrade_proration(user, period_start, period_end)` | `add_upgrade_proration.sql` | Mid-cycle upgrade token top-up: grants `floor((new_allowance − old_allowance) × remaining_period_fraction)` as an `adjustment` row. No-op for downgrade/same/period-switch/repeat (guarded on period + target plan). Called from the webhook's `subscription.updated` handler after the sub upsert. |
| `settle_token_usage`, `reserve_tokens`, `release_tokens` | `token_metering.sql` | The meter (see `token-metering.md`). |
| `usage_by_month`, `usage_summary_since` | `usage_by_month.sql` | Monthly usage summary + rolling-window total for the recommendation. |
| `recent_usage_actions(user, limit)` | `GraveLens/db/migrations/gravelens_recent_usage_actions.sql` | Recent AI spend grouped by `coalesce(prompt_id,id)` → one row per user action (`started`, `action_tokens`, `call_count`, `tool`, `components[]`) for the rewards **Usage** tab. Read-only `SECURITY DEFINER`, `service_role`-only. **Already applied to the shared Supabase (GraveLens added it) — verify via introspect; only emit for a fresh standalone project.** Either way `fetchRecentUsage` has a ~150-row JS-grouping fallback, so the Usage tab works even if the RPC is absent. Introspect live `api_usage_log` columns first (repo drift). |
| `claim_goal`, `complete_referral`, `record_subscription_state` | goals/referral migrations | Rewards + subscription history. |

If a fresh/standalone project is missing these, run the source files above (in dependency order:
billing tables → rollover/gift helpers → loyalty grants → `fix_monthly_reset_ledger.sql` →
`add_upgrade_proration.sql` → `token_metering.sql` → `usage_by_month.sql` → goals/referral). Each is `CREATE OR REPLACE` /
idempotent. **Backfill** `token_balances.used_tokens` once from `api_usage_log` when first enabling
the meter (see the commented UPDATE at the bottom of `token_metering.sql`).

## Auth (prerequisite for billing)

Billing routes call `requireAuth` (Supabase session). If the app supports signup, wire it against
the **shared Auth project + email templates**:

- Send signup metadata `app_base_url` + `app_name` so confirmation emails link back to THIS app.
- Add `/auth/callback` that confirms via `token_hash` + `verifyOtp`.
- See the "Adding a signup-capable site" checklist in `lowhigh-ecosystem-topology`.

Port GraveLens `src/lib/apiAuth.ts` (`requireAuth`) and `src/lib/supabase/{server,service,browser}.ts`.

## App-specific vs shared

- **Shared (reuse, don't recreate):** all tables/RPCs above, plans/prices catalog, goals system.
- **App-specific (build/port per app):** the API routes under `api/billing/*`, the pages, the
  `EcosystemProvider`, the AI routes' metering wiring, and making your app's goals
  `visible_in_apps` include the new app slug.
