# Pages & routes to port

GraveLens (`GraveLens/`) is the reference implementation. Port these, adapting names/theme to the
new app. Paths below are under `GraveLens/`. Keep the structure — the pieces interlock.

## Server libs (port first)

| File | Role |
|---|---|
| `src/lib/apiAuth.ts` | `requireAuth()` → `{userId, accessToken}` or 401. |
| `src/lib/supabase/{server,service,browser}.ts` | SSR client, service-role client (`getServiceClient`), browser client. |
| `src/lib/stripeCustomer.ts` | `getStripe()` (pinned apiVersion), `ensureStripeCustomer()` (idempotent by `metadata.supabase_user_id`), `getStripePriceIdForPlan()`. |
| `src/lib/stripeFulfillment.ts` | Webhook fulfillment: `processEvent` dispatch, `apply_topup`/`apply_monthly_token_reset` calls, subscription upserts, dedup via `stripe_processed_events`. **Gifts left unprocessed.** Two plan-change musts: (1) resolve plan + `billing_period` from the **active price id** (check `stripe_price_id_monthly` then `stripe_price_id_annual`), NOT `metadata.plan_slug`/`billing_period` — that metadata goes stale after a portal-driven change. (2) On `customer.subscription.updated`, call `apply_upgrade_proration` after the upsert so a mid-cycle upgrade tops up tokens (no-op for downgrades/repeats). |
| `src/lib/billingData.ts` | Server reads: `fetchBillingForUser` (populates `SubscriptionSummary` incl. `cancelAtPeriodEnd` from the DB row and `pendingDowngrade` via `resolvePendingDowngrade`, which reads the Stripe **schedule**'s future phase), `fetchTransactionHistory` (composite `(created_at,id)` cursor), `fetchMonthlyUsage`, **`fetchRecentUsage`** (per-action recent spend: tries `recent_usage_actions` RPC, falls back to grouping ~150 recent `api_usage_log` rows by `coalesce(prompt_id,id)` in JS so it works before the RPC is applied; admin-bypass → `[]`), `fetchPlanRecommendation` (uses `usage_summary_since`), `fetchPlanChangeImpact`, catalog. |
| `src/lib/billingService.ts` | Client fetchers: catalog, `fetchTransactionHistory`, `fetchMonthlyUsage`, **`fetchRecentUsage`** (GET `usage-recent`, degrades to `[]`), `fetchConfirmation`, `fetchPlanRecommendation`, `fetchPlanChangeImpact`, `fetchUsageStats`. Actions: `startSubscriptionCheckout` returns `PlanChangeOutcome \| void` — a downgrade resolves to `{scheduled,effectiveAt,planName}` (caller confirms in place), new/upgrade redirect to Stripe; `setSubscriptionCancellation(resume?)`, `cancelScheduledChange`, `startTopupCheckout`, `openBillingPortal`. |
| `src/lib/billingTypes.ts` | `PlanChangeImpact` (direction + token/loyalty/rollover/price deltas + `nearestMilestone`), `PlanRecommendation`, `PlanUpsellTarget`; re-exports `UsageAverage`. |
| `src/lib/lowhighClient.ts` | Shared types (`BillingData`, `TokenTransaction`, `MonthlyUsage`, `ConfirmationDetail`, **`UsageAction`** `{promptId,started,actionTokens,callCount,tool,components}`) + `formatTokens` (compact, e.g. `1.2M`) **and `formatTokensExact`** (comma-grouped integer for the exact-balance hero). |
| `src/lib/lowhigh.ts` | `logUsage` → inserts `api_usage_log` **and** calls `settle_token_usage` (the meter). Pricing from `ai_models` + fallback. |
| `src/lib/tokenGate.ts` | `admitAiCall` (reserve + release handle) + `TOKEN_ESTIMATES`. See `token-metering.md`. |
| `src/lib/txLabels.ts`, `src/lib/format.ts` | Human ledger labels (`goal:`/`referral:` legacy handling) + `fmtDate`. |

## API routes (`src/app/api/billing/`)

| Route | Notes |
|---|---|
| `catalog` (GET) | Public plans + top-up packages + tier discounts. |
| `subscription-checkout` (POST) | **Three-way branch.** (1) **No live sub** → `mode:subscription` Checkout; `success_url = ${origin}/billing/confirmation?session_id={CHECKOUT_SESSION_ID}`; metadata `{supabase_user_id, plan_slug, billing_period, kind}`. (2) **Existing live sub + upgrade or interval switch** (target tier ≥ current) → Billing Portal session `flow_data.type:'subscription_update_confirm'` targeting `{subscription, items:[{id: currentItemId, price: newPriceId}]}` + `after_completion.redirect` to `${origin}/plan?upgraded=<name>`; reject same-price with 400; return `{url}`. (3) **Existing live sub + downgrade** (target tier < current) → build a **Stripe subscription schedule** `from_subscription`, set `end_behavior:'release'`, `proration_behavior:'none'`, phases = [current price until `phase[0].end_date`, then new price] → return `{scheduled:true, effectiveAt, planName}` (NO url, no charge). **Before either existing-sub branch, release any already-attached schedule** (`subscriptionSchedules.release`) so a stale pending downgrade doesn't block an upgrade or shadow a new downgrade. Determine tier by looking up `subscription_plans.tier_level` for the current price id and the target slug. NEVER open a second Checkout for an existing sub. |
| `topup-checkout` (POST) | `mode:payment`; `invoice_creation:{enabled:true}`; metadata carries `kind:'topup'`, `tokens`, `charge_amount_usd`. |
| `cancel-subscription` (POST) | Sets Stripe `cancel_at_period_end` (keeps access until period end); `{resume:true}` reverses it. Also writes `user_subscriptions.{cancel_at_period_end,canceled_at}` directly so the UI updates without waiting on the webhook (which re-syncs the same value). Returns `{ok, cancelAtPeriodEnd}`. |
| `cancel-scheduled-change` (POST) | Releases the subscription's Stripe schedule (`subscriptionSchedules.release`) so a pending deferred downgrade is cancelled and the subscriber stays on the current price. Returns `{ok}`. |
| `webhook` (POST) | Verify signature with `STRIPE_WEBHOOK_SECRET` on the RAW body; dedup; `processEvent`. No auth (Stripe signature is the auth). Handles `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.{created,updated,deleted}`. The schedule's phase-2 price flip and the cancel both arrive as normal `subscription.updated`/`deleted` — **no `subscription_schedule.*` subscription needed** (the code doesn't handle those event types). |
| `confirmation` (GET) | Retrieves the Checkout Session (expand line_items), **ownership-gates (404 to non-owner)**, returns itemized detail. Read-only — never credits tokens. |
| `transactions` (GET) | Paginated ledger (Added scope). |
| `usage-monthly` (GET) | Monthly usage summary (Used scope). |
| `usage-recent` (GET) | `?limit=` → `{actions: UsageAction[]}` — recent AI spend, one row per user action (grouped by `prompt_id`), for the rewards **Usage** tab. `requireAuth`, service-role read via `fetchRecentUsage`. **Kept separate from `/api/billing`** (the hot every-load snapshot); page-local. |
| `portal` (POST) | Stripe Billing Portal session (manage payment method / invoices). Note: cancel and downgrade are handled **in-app** (routes above), not by sending the user to the portal home. |
| `plan-recommendation` (GET) | Tier-driven upsell payload for `/plan`. |
| `plan-change-impact` (GET) | `?target=<slug>` → concrete `PlanChangeImpact` (token/loyalty/rollover/price deltas + `nearestMilestone`, `direction`). Powers the drawer cards and the retention-drawer loss list. |
| `usage-stats` (GET) | `{averages: UsageAverage[], monthlyTokens}` for the estimator + recommendation. |

## Pages (`src/app/`)

- `billing/page.tsx` — pricing (tokens-first copy), plan cards, checkout CTAs. Subscribers →
  `/plan` (with `?as_prospect=1` escape).
- `plan/page.tsx` — change plan + `PlanRecommendation` + `TopupDeflection` + rollover-policy line +
  the **"Other Plan Options"** disclosure that mounts `PlanChangeDrawer` (remount via `key` on
  open/close). Shows a **pending-change banner**: red "Subscription ending" + *Resume subscription*
  when `subscription.cancelAtPeriodEnd`, else amber "Downgrade scheduled" + *Keep my current plan* when
  `subscription.pendingDowngrade`. On return from a portal upgrade, reads `?upgraded=<name>`, toasts
  once, refreshes, strips the param.
- `topup/page.tsx` — quantity slider, tier price, usage breakdown.
- `billing/confirmation/page.tsx` — itemized purchase from the session (authoritative), then polls
  `eco.refresh()` for the eventually-consistent balance; graceful "updating" fallback; distinct
  from `/plan` redirect.
- `billing/history/page.tsx` — tabs **Added** (itemized) / **Used** (monthly summary + expired).
- `rewards/page.tsx` — hero **exact** available-balance (`formatTokensExact`, `title` hover,
  `text-3xl sm:text-4xl` so the 9-digit admin sentinel doesn't overflow; admin → "Unlimited"),
  rewards/goals sections, and `RecentActivity`. The 3-stat grid + `EstimatedUsesPanel` stay
  abbreviated (`formatTokens`).

## Components

- `src/components/ecosystem/EcosystemProvider.tsx` — the client billing context: `billing`,
  `availableTokens`, `loading`, `refresh`, `showOutOfTokens`, `tokenAlert` (low/out state + dismiss),
  and `showToast` (used by the plan-change/cancel/resume confirmations). Wrap the app in it (in
  `layout.tsx`).
- `src/components/billing/PlanChangeDrawer.tsx` — inline "Other Plan Options" drawer: per-plan
  `CompactPlanCard`s (upgrade = emerald, downgrade = amber) with `fetchPlanChangeImpact` deltas, a
  monthly/annual toggle (only when a plan has annual pricing), and an estimated-uses preview
  (`TokenUsageBreakdown`). Choosing upgrades navigates to Stripe; a downgrade returns `{scheduled}` →
  toast + `onChanged()` + close (no nav). Footer link opens the nested cancel flow.
- `src/components/billing/CancelRetentionDrawer.tsx` — nested inside `PlanChangeDrawer`. Lists concrete
  **losses** (rollover bank, monthly allowance, nearest milestone from `fetchPlanChangeImpact('starter')`),
  offers a **downgrade-to-Starter** alternative, then "Cancel anyway" → `setSubscriptionCancellation()`
  (in-app `cancel_at_period_end`, not the portal). Each path toasts and calls `onChanged()`.
- `src/components/billing/TokenAlertBar.tsx` — global low/out header bar (see `token-metering.md`
  for thresholds); render in `PageShell`.
- `src/components/rewards/RecentActivity.tsx` — the collapsible "ledger" card, with **two tabs:
  Additions | Usage**. Additions renders credits from the balance snapshot (props). Usage renders
  per-action AI spend from `fetchRecentUsage`, **preloaded on mount + per-user session-cached**
  (`gl_recent_usage`) so switching tabs is instant (no pop-in), stone-colored `−` amounts, no
  balance-after, no call counts. Tabs reuse the gold `aria-selected` pill styling from
  `billing/history`. (There is intentionally **no** separate `RecentUsage` component — it's one panel.)
  (The rewards page also uses `GoalsSection`/`GoalCard`/`ReadyToClaim`/`EstimatedUsesPanel` — the
  goals-hub UI over the shared `goals` table; port alongside if the app offers rewards. In `GoalCard`,
  an unearned reward's status chip reads **"Not yet earned"**, a coming-soon one **"In progress"**.)
- `src/components/ui/{Card,Banner}.tsx` — shared chrome. `ProfileBadge` shows the persistent
  low/out dot.

## Copy conventions

Tokens-first pricing (allowance / rollover / top-up rate are the focus, not app parity). Warm,
understated voice. No em dashes, no exclamation points, no "early access"/"live" claims. Type
labels: "Monthly tokens", "Top-up", "Usage", "Reward" (not company jargon). Unearned reward chips
read **"Not yet earned"** (never "Locked" — pay-to-unlock connotation), coming-soon ones "In progress".
