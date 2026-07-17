---
name: configure-tokens-and-payments
description: Read and follow when adding tokens, payments, billing, subscriptions, top-ups, a confirmation page, a balance/rewards surface, transaction history, or AI token metering/enforcement to a LowHigh ecosystem app. The blueprint distilled from GraveLens so a new app's payment system doesn't have to be rebuilt from scratch. Always ends by telling the user which Vercel env vars, Supabase SQL, and manual (Stripe/dashboard) steps they must do by hand.
metadata:
  type: reference
---

# Configure Tokens & Payments (LowHigh blueprint)

Stand up a new LowHigh app's payment + token system by **porting GraveLens's self-hosted
billing**, not reinventing it. GraveLens is the living reference implementation; this skill maps
what to copy, what already exists in the shared backend, and — critically — the parts **only the
user can do** (Vercel env, Supabase SQL, Stripe dashboard).

## Read first

- `lowhigh-ecosystem-topology` — how the apps, domains, and the ONE shared Supabase + Stripe
  relate. Everything here assumes that shared backend.
- Sibling skills to compose with: `stripe-best-practices` (Checkout/keys/webhooks),
  `usage-tracking-estimator` (the /usage estimator + api_usage_log rules).

## The core model (why this is mostly copy, not build)

<!-- Full diagram + surface list in references/architecture.md -->


Every LowHigh app shares **one Supabase project and one Stripe account**. The billing *tables and
RPCs already exist* there (created for LowHigh/GraveLens). A new app therefore:

1. **Self-hosts its own billing API routes + pages** (same-origin; do NOT depend on a cross-origin
   LowHigh API — it isn't deployed. No `NEXT_PUBLIC_LOWHIGH_API_BASE` for billing).
2. Reads/writes the shared tables server-side with the **service-role key** (RLS bypassed;
   enforce `user_id === auth.userId` in app code).
3. Reuses the shared RPCs (`apply_topup`, `apply_monthly_token_reset`, `settle/reserve/release_tokens`,
   `claim_goal`, …). Usually **no new SQL** is needed — but verify (see `references/backend-checklist.md`).

## Procedure

Work in this order. Each step points at a reference for detail.

1. **Confirm the shared backend** exists — `references/backend-checklist.md` (verify tables + RPCs;
   run the canonical `migrations/*.sql` only for anything missing).
2. **Wire auth** if the app is signup-capable — it's a hard prerequisite for billing (`requireAuth`).
   See `references/backend-checklist.md` → Auth.
3. **Port the routes + pages** from GraveLens — `references/pages-and-routes.md`.
4. **Add token metering** to the app's AI routes — `references/token-metering.md` (deduction is
   always-on; blocking is behind an app enforce flag).
5. **Gather the manual outputs** and give them to the user — `references/env-and-manual.md`.
6. **Verify end-to-end** — the two-terminal `vercel dev` + `stripe listen` test with card `4242…`.
7. When anything misbehaves, consult `references/gotchas.md` before re-deriving.

## MANDATE — always output these three lists for the user

The assistant cannot touch Vercel, Supabase, or Stripe. So **every run of this blueprint MUST end
with three clearly-labeled sections the user acts on by hand** (omit a section only if truly empty):

- **A) Vercel environment variables** — exact names + what each is, per `references/env-and-manual.md`.
  Flag the Development-target + restart gotcha.
- **B) Supabase SQL** — the exact statements to run (only what's missing/new), `$$`-quoted, with an
  introspect-first note (repo migrations can drift from live).
- **C) Stripe + other manual steps** — products/prices, restricted-key scopes, webhook endpoint +
  `whsec_`, account branding, enforcement rollout, etc.

Plus a short **verification** checklist. Never claim the payment system "works" without stating what
the user still has to do and how to test it.

## Hard rules (learned the hard way — do not relitigate)

- **Env lives only in Vercel cloud.** No `.env*` files, ever. Env is snapshotted at process
  startup → after any env change the user must **redeploy / restart** (`next dev`/`vercel dev`).
  Know which command the app runs — it changes where env comes from (see `gotchas.md`).
- **`STRIPE_SECRET_KEY`** (or a restricted key with Customers/Checkout/Billing-portal write +
  Subscriptions read) drives Checkout; it is NOT `STRIPE_WEBHOOK_SECRET`.
- **`success_url` = `${origin}/billing/confirmation?session_id={CHECKOUT_SESSION_ID}`** (literal
  template). The confirmation page reads the session (race-safe vs the async webhook).
- **Metering:** deduct actual `lowhigh_tokens` on every AI call (never let an unpriced model bill
  free — use a fallback rate); atomic **reserve at the gate + always `after(release)`**; blocking
  behind an app `*_ENFORCE_TOKEN_GATE` flag. See `token-metering.md`.
- **Ledger:** transaction history keyset-paginates on a **composite `(created_at, id)`** cursor
  (a bare timestamp skips rows that share a `created_at`). `apply_monthly_token_reset` needs its
  idempotency guard (double webhook fire).
- **Balance & usage display.** The rewards hero shows the **exact** available balance via
  `formatTokensExact` (comma-grouped integer, e.g. `1,247,300`), with the precise value also in a
  `title` for hover — NOT the abbreviated `formatTokens` (that stays for secondary stats + estimator
  averages). Admin (`status:'admin'`) shows **"Unlimited"**, never the `999,999,999` sentinel.
  Recent activity is **one collapsible ledger with two tabs — Additions | Usage** (not two separate
  cards, not one interleaved running-balance feed): Additions = credits from the balance snapshot;
  Usage = per-action AI spend **grouped by `prompt_id`** (one user action per row, stone amount so
  spend reads distinct from earn, **no balance-after** — `api_usage_log` stores none, so a running
  balance on debits would be fabricated). Usage is **preloaded on mount + session-cached** so it
  paints like Additions (no pop-in), fed by a **dedicated `usage-recent` route + `recent_usage_actions`
  RPC with a ~150-row JS-grouping fallback** — NEVER folded into the hot `/api/billing` snapshot.
  Don't surface call counts (users never see individual API calls; group them away).
- **Plan changes ≠ new subscriptions — and upgrade ≠ downgrade.** `subscription-checkout` is a
  **three-way branch**: (1) no live sub → `mode:subscription` Checkout; (2) live sub + **upgrade or
  interval switch** → Billing Portal `subscription_update_confirm` (Stripe prorates, applies now);
  (3) live sub + **downgrade** (target tier < current) → a **deferred Stripe subscription schedule**
  (`proration_behavior:none`, `end_behavior:release`, phase 2 = new price at period end) — returns
  `{scheduled,effectiveAt,planName}`, no navigation, no charge/credit now. NEVER send an existing sub
  through a second `mode:subscription` Checkout (charges full price + double-subscribes). Always
  **release any attached schedule first** before an immediate upgrade (a pending schedule blocks the
  in-place update) or before building a fresh downgrade schedule (latest choice wins). The webhook
  resolves plan + period from the active **price id** (not stale metadata) and tops up a mid-cycle
  upgrade via `apply_upgrade_proration`. Requires a one-time **portal config** step (enable plan
  switching, whitelist every price, proration = invoice immediately) for the upgrade path. See
  `gotchas.md` + `env-and-manual.md` §C.4.
- **Asymmetric friction (retention).** Upgrade is one click; **downgrade and cancel route through
  in-app retention drawers** (`PlanChangeDrawer` → nested `CancelRetentionDrawer`) that show concrete
  losses (rollover bank, allowance, nearest milestone) before proceeding — never the generic Stripe
  portal home. Cancel is **in-app `cancel_at_period_end`** (`cancel-subscription` route), not a portal
  redirect, and is fully reversible: **resume** (`{resume:true}`) undoes a pending cancel, and
  `cancel-scheduled-change` (releases the schedule) undoes a pending downgrade. Both cancel/schedule
  routes write `user_subscriptions` directly for instant UI; the webhook re-syncs the same values. The
  `/plan` page surfaces a pending-cancel (red) or pending-downgrade (amber) banner with the reverse
  action. `pendingDowngrade` is read from the Stripe **schedule** inside the billing read.
- **`appSlug` is frontend-first** (the UI feature name), never hardcoded in shared service
  functions. Usage logs **directly to Supabase `api_usage_log`** (no bridge endpoint).
- **Gifts are intentionally NOT fulfilled** by non-LowHigh apps (leave the event unprocessed).
- **Copy:** no em dashes, no "early access"/"live" claims. Pricing leads with **tokens**, not apps.
  Unearned rewards read **"Not yet earned"**, NOT "Locked" — in an app that also sells tokens, "Locked"
  reads as pay-to-unlock. (Coming-soon rewards read "In progress".)
