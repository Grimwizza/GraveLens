# Gotchas & common failures (from building GraveLens)

Consult before re-deriving. Each is a real bug/lesson already paid for.

## Environment / Vercel

- **"Failed to prepare customer record"** on checkout = the customer/Stripe step threw. Almost
  always `STRIPE_SECRET_KEY` missing/wrong, or a restricted key lacking Customers/Checkout write.
  The real cause is logged server-side (`[subscription-checkout] customer error: …`) — read the
  dev-server terminal, not just the browser.
- **Env changes don't take effect** until the process restarts (env is snapshotted at startup).
  Restart `vercel dev`/`next dev` (or redeploy) after any change. This masquerades as "my new key
  isn't working."
- **`vercel dev` vs `next dev`** source env differently. `vercel dev` pulls Vercel cloud vars for
  the **Development** target only; `next dev` reads local files and ignores Vercel entirely. Know
  which the app runs before debugging "missing" vars.
- The assistant cannot run Vercel/Supabase/Stripe CLIs or read env values — always hand the user
  the action list and ask them to check the browser Network tab / dev terminal.

## Stripe

- `STRIPE_WEBHOOK_SECRET` ≠ `STRIPE_SECRET_KEY`. Webhook secret verifies incoming events; secret key
  authenticates outbound API calls.
- Webhook won't reach `localhost` — use `stripe listen --forward-to localhost:3000/api/billing/webhook`;
  its printed `whsec_` is the secret to use locally (different from the dashboard endpoint's).
- Don't pass both `customer` and `customer_email` to a Checkout Session — Stripe rejects it; the
  customer already carries the email (prefilled).
- A new subscription fires **both** `checkout.session.completed` and
  `invoice.payment_succeeded(subscription_create)` → `apply_monthly_token_reset` can run **twice**.
  Its idempotency guard (keyed on the period's allocation row; short-window fallback when
  `period_start` is null) prevents a double grant. Keep it.
- **An existing subscriber must never be sent through a second `mode:subscription` Checkout.** Doing
  so charges the new plan's FULL price and creates a *second* live subscription (double-billing) —
  the classic symptom is "Stripe charged full price for the upgrade." Route existing subs through the
  Billing Portal `subscription_update_confirm` flow (upgrade) or a Stripe schedule (downgrade). See
  `pages-and-routes.md` → `subscription-checkout`, and the portal-config manual step in `env-and-manual.md`.
- **The portal can't defer a cross-product (cross-tier) downgrade.** `subscription_update_confirm`
  applies immediately with a proration credit — wrong for a downgrade (the user paid for the higher
  tier through period end). Do downgrades as a **Stripe subscription schedule** (`from_subscription`,
  `proration_behavior:'none'`, `end_behavior:'release'`, phase-2 = new price) so the switch lands at
  period end with no charge/credit. Phase 2 activating fires a normal `customer.subscription.updated`,
  so the DB self-syncs (plan resolved from the active price) — no schedule-specific webhook needed.
- **A stale schedule blocks the next change.** If a pending-downgrade schedule is attached, an
  immediate upgrade (`subscription_update_confirm`) errors and a new downgrade double-schedules.
  Always `subscriptionSchedules.release(existingScheduleId)` FIRST in both the upgrade and downgrade
  branches. `cancel-scheduled-change` releasing the schedule is how the user reverses a pending
  downgrade (keeps the current price).
- **In-app cancel must write the DB too, or the UI lags a webhook round-trip.** `cancel-subscription`
  sets Stripe `cancel_at_period_end` AND updates `user_subscriptions.{cancel_at_period_end,canceled_at}`
  directly; the webhook re-syncs the same value idempotently. Cancel is `cancel_at_period_end` (not
  `subscriptions.cancel` / immediate delete) so access + a Resume path survive to period end.
- **`pendingDowngrade` costs a Stripe read.** It isn't a DB column — `fetchBillingForUser` retrieves
  the subscription's schedule and finds the future phase. Only when a schedule is attached; keep it in
  the central billing read (not a per-page Stripe call). `cancelAtPeriodEnd` IS a DB column (cheap).
- After a portal-driven plan change, the subscription's `metadata.plan_slug`/`billing_period` stay
  **stale** (set at creation). Resolve plan + period from the active **price id** in the webhook, or
  the DB will keep showing the old plan. The proration invoice carries
  `billing_reason:'subscription_update'` (not `subscription_cycle`/`_create`), so the normal
  invoice-paid token grant skips it — that's why the upgrade top-up lives in `apply_upgrade_proration`
  off `customer.subscription.updated`, not the invoice handler.

## Supabase / SQL

- **PGRST203 "could not choose the best candidate function"** = two overloads of an RPC coexist
  (e.g. `apply_topup` 4-arg + 5-arg). Drop the stale one: `DROP FUNCTION IF EXISTS public.<fn>(<types>);`.
- SQL editor mishandles `$function$` from `pg_get_functiondef` (unterminated dollar-quote, and it
  auto-appends bogus `ALTER TABLE … ENABLE RLS` for `SELECT … INTO` vars). **Re-quote as `$$`.**
- **Repo migrations drift from live.** Introspect the live function/table before altering
  (`pg_get_functiondef`, `pg_proc`, `pg_tables`).
- Monthly-reset ledger bugs to avoid: the rollover row must not double-count carryover in
  `balance_after`; don't emit a separate "carried over" ledger row (it double-represents tokens
  already recorded) — carryover lives in `token_balances.rollover_tokens`.

## Accounting / metering

- **Usage that never decrements the balance:** logging to `api_usage_log` is not enough —
  `token_balances.used_tokens` must be incremented (via `settle_token_usage`). Without it,
  `available_tokens` never falls and the gate never fires.
- **Unpriced model = free usage:** a model missing from `ai_models` yields null cost → no deduction.
  Always fall back to a conservative rate.
- **Keyset pagination skips rows** that share a `created_at` (e.g. a reset's allocation+bonus at the
  same `NOW()`) if you paginate on the bare timestamp. Use a composite `(created_at, id)` cursor.
- Rollover on a **first** subscription mislabels a user's pre-existing bonus tokens as "carried over
  from a previous period." The clean fix was to drop the rollover ledger row entirely.

## Data / labels

- Goal claims that write `p_description = 'goal:<slug>'` leak the raw slug into the ledger. Write the
  human `goal.title` instead, and add a frontend formatter (`txLabels.ts`) that rewrites legacy
  `goal:`/`referral:` rows.

## Process

- Bugs → `systematic-debugging` (root cause before fixes). Billing changes → `/code-review` (and
  the cloud `claude ultrareview` before enabling enforcement). Verify before claiming done.
