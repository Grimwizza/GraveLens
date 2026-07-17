# Architecture

## One backend, many self-hosted frontends

- **One Supabase project** holds all billing/token/rewards state, shared by every LowHigh app.
- **One Stripe account** holds all customers, prices, subscriptions.
- Each app **self-hosts** its billing API routes + pages (same-origin serverless functions) that
  read/write the shared Supabase with the **service-role key** and drive Stripe with the shared
  secret key. GraveLens does this precisely because LowHigh's own billing API is not deployed at
  lowhigh.ai — so never route billing cross-origin.

## The money/token flow

```
User → app pricing page (/billing) ──POST /api/billing/subscription-checkout─┐
       app topup page (/topup)     ──POST /api/billing/topup-checkout────────┤
                                                                             ▼
                                                          Stripe Checkout (hosted)
                                                                             │ pays
                                success_url → /billing/confirmation?session_id={CHECKOUT_SESSION_ID}
                                                                             │
        Stripe webhook ──POST /api/billing/webhook──► verify sig, dedup on   │
        (checkout.session.completed, invoice.payment_succeeded,              │
         customer.subscription.*)                     stripe_processed_events│
                                                                             ▼
                            fulfillment RPCs on shared Supabase:
                            • apply_topup            → token_transactions(type=top_up) + token_balances.purchased
                            • apply_monthly_token_reset → allocation row + rebase token_balances (on sub create/renew)
                            • upsert user_subscriptions + record_subscription_state
```

## Plan-change / cancel lifecycle (asymmetric friction)

```
/plan  ── "Other Plan Options" ─► PlanChangeDrawer
          ├─ upgrade  ─► subscription-checkout ─► Billing Portal subscription_update_confirm ─► /plan?upgraded=  (immediate, prorated)
          ├─ downgrade─► subscription-checkout ─► Stripe subscription SCHEDULE (defer to period end) ─► {scheduled} toast, no nav
          └─ "Cancel subscription" ─► CancelRetentionDrawer (shows losses)
                    ├─ "Try Starter" ─► downgrade schedule (as above)
                    └─ "Cancel anyway" ─► cancel-subscription {cancel_at_period_end:true}
Pending states shown on /plan banner, each reversible:
   cancel_at_period_end  ─► cancel-subscription {resume:true}
   scheduled downgrade   ─► cancel-scheduled-change (release the schedule)
```

- **Upgrades apply now** (portal confirm, prorated via `apply_upgrade_proration`). **Downgrades and
  cancels are deferred** to period end (schedule / `cancel_at_period_end`) so the user keeps what they
  paid for and can reverse costlessly. `subscription-checkout` releases any attached schedule before
  either an immediate upgrade or a fresh downgrade schedule.
- The schedule's phase-2 price change and the cancel both surface to the DB via the normal
  `customer.subscription.updated`/`deleted` webhook (plan resolved from the active price) — plus the
  routes write `user_subscriptions` directly for instant UI. No new webhook events beyond
  `customer.subscription.*`.
- `pendingDowngrade` on `SubscriptionSummary` is resolved from the Stripe **schedule** inside
  `fetchBillingForUser` (one Stripe call when a schedule is attached); `cancelAtPeriodEnd` comes from
  the DB row.

- **Balance** = `v_token_balances.available_tokens = allocated + purchased + rollover − used`.
- **Usage** is logged to `api_usage_log` (one row per AI call, normalized `lowhigh_tokens`, 1M = $1
  of API cost) and **decrements `token_balances.used_tokens`** via the meter (see `token-metering.md`).
  Usage is NOT itemized in `token_transactions` (no `debit` rows) — so it's surfaced two ways from
  `api_usage_log`: the `/billing/history` **Used** tab (monthly summary) and the `/rewards` **Usage**
  tab (recent per-action spend, grouped by `prompt_id` via `recent_usage_actions` / `usage-recent`).
  Because debits carry no stored balance-after, usage is shown as standalone spend rows, never a
  running-balance feed interleaved with credits.
- **Balance is displayed exactly** on `/rewards` (`formatTokensExact`, comma-grouped), not the
  compact `formatTokens` used for secondary stats; admins see "Unlimited".

## Surfaces an app can offer (all optional, all ported from GraveLens)

| Surface | Purpose |
|---|---|
| `/billing` | Prospect pricing (plans + top-up), Stripe checkout entry. Subscribers redirect to `/plan`. |
| `/plan` | Subscriber dashboard: change plan, usage-based recommendation, rollover policy line, and the **pending-change banner** (red = cancel scheduled + Resume; amber = downgrade scheduled + Keep current plan). Hosts the asymmetric-friction `PlanChangeDrawer` → `CancelRetentionDrawer`. |
| `/topup` | Buy more tokens (tier-priced). |
| `/billing/confirmation` | Post-purchase itemized confirmation (race-safe via the Stripe session). |
| `/billing/history` | Full ledger: Added (itemized) / Used (monthly summary). |
| `/rewards` | **Exact** balance (comma-grouped; admin "Unlimited") + rewards/goals hub + the collapsible "Recent activity" ledger with **Additions \| Usage** tabs (credits vs per-action AI spend) + low/out token bar. |
| `/usage` (optional) | Per-app/component usage estimator — see the `usage-tracking-estimator` skill. |

## Dependencies to keep straight

- **Auth first.** All billing routes use `requireAuth` (Supabase session). A signup-capable app must
  wire signup metadata + `/auth/callback` (see `backend-checklist.md` → Auth).
- **Rewards/goals** read the shared `goals` table filtered by a `visible_in_apps` column; claims go
  through the existing `claim_goal` RPC. Don't recreate the goals system — make your app's goals
  visible and port the page.
- **Ecosystem topology** governs domains/SSO/shared-account questions — read that skill when unsure.
