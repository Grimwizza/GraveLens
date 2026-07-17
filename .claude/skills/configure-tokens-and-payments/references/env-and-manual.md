# Env vars + manual steps (what only the user can do)

The assistant has no access to Vercel, Supabase, or Stripe. Use this to produce output lists **A**
(env), **B** (SQL — see `backend-checklist.md`), and **C** (manual). Present exact names/values-shape.

## A) Vercel environment variables

All env lives ONLY in Vercel cloud settings (no `.env*` files, by design). For each, tell the user
to add it to the app's Vercel project.

| Variable | What it is |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key `sk_...` **or** a restricted key `rk_...` with the scopes below. Drives Checkout/customers/portal. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` signing secret for `/api/billing/webhook`. **Different** from the secret key; from Stripe → Webhooks (or `stripe listen`). |
| `STRIPE_PRICE_STARTER_MONTHLY` / `_ANNUAL`, `_PLUS_*`, `_PREMIUM_*` | Stripe Price IDs `price_...` per plan × period (mirror the plan slugs). |
| `NEXT_PUBLIC_SUPABASE_URL` | Shared Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Shared Supabase service-role key (server-only). |
| `<APP>_ENFORCE_TOKEN_GATE` | `"true"` to enable AI token **blocking** (leave unset/observe-only until Phase A is validated). Name it per app, e.g. `GRAVELENS_ENFORCE_TOKEN_GATE`. |
| Auth: `app_base_url`, `app_name` (or however the app passes signup metadata) | So confirmation emails link back to THIS app. |

**Gotchas to flag every time:**
- Env is read at process **startup** → after adding/changing any var the user must **redeploy**
  (or restart `vercel dev` / `next dev`). Changing a var while the server runs does nothing.
- If the app runs `vercel dev`, the vars must be on the **Development** environment target
  (shared/prod-only vars won't be pulled). If it runs `next dev`, Vercel cloud vars aren't pulled
  at all — that's a separate setup.

## B) Supabase SQL

Emit only what's missing/new (verify first per `backend-checklist.md`). Always `$$`-quote functions
(the SQL editor mishandles `$function$`), and tell the user to introspect live before running
(repo migrations can drift). Typical for a same-project app: **none** (backend already exists),
except making the app's goals `visible_in_apps` include the new slug, and — if enabling the meter
for the first time — the `token_metering.sql` RPCs + the one-time `used_tokens` backfill.

## C) Stripe + other manual steps

1. **Products & Prices** — create the plan products + monthly/annual prices and top-up rate in
   Stripe; copy the `price_...` IDs into the env vars above. (Sandbox first.)
2. **Restricted key scopes** (if using `rk_...`): Customers **write**, Checkout Sessions **write**,
   Billing → Customer portal **write**, Subscriptions **read**. Missing scopes → "Failed to prepare
   customer record".
3. **Webhook** — add endpoint `https://<app-domain>/api/billing/webhook`, subscribe to
   `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.*`; copy its
   `whsec_` into `STRIPE_WEBHOOK_SECRET`. For **local** testing use
   `stripe listen --forward-to localhost:3000/api/billing/webhook` (its `whsec_` is different) and
   set that as the Development-scoped secret.
4. **Customer portal — enable plan switching (REQUIRED for the upgrade path).** Settings →
   Billing → Customer portal: turn on **"Customers can switch plans"**, add **all** subscription
   products **and every price** (monthly + annual for each) to the allowed list, and set proration to
   **"Invoice immediately"** (that setting — not code — is what charges the prorated difference now).
   Every `price_...` the app can send must be whitelisted or the upgrade flow 400s with *"the
   configuration … does not include the price in its features[subscription_update][products]"*.
   Test mode and live mode have **separate** portal configs — do both. (Downgrades and cancels are
   handled **in-app** via subscription schedules / `cancel_at_period_end`, so they don't depend on the
   portal — but the whitelist above still gates upgrades.) No extra Stripe config is needed for
   subscription **schedules**; they're an API capability, and their phase changes arrive as the
   `customer.subscription.updated` events you already subscribe to.
5. **Account branding** — set the Stripe account display name to the app's brand (shows in the
   Checkout header) and confirm email receipts are on.
6. **Enforcement rollout** — validate Phase A (balances drop as AI is used), tune `TOKEN_ESTIMATES`,
   then set `<APP>_ENFORCE_TOKEN_GATE=true` + redeploy.

## Verification checklist (state this, don't skip)

Two terminals: `vercel dev` (or the app's dev command) + `stripe listen …`. Then:
- Subscribe with test card `4242 4242 4242 4242` → lands on `/billing/confirmation`; `stripe listen`
  shows `checkout.session.completed [200]`; balance updates.
- **Upgrade an existing subscriber** → the portal confirm screen shows a **prorated** amount (not
  full price), only ONE subscription remains after, the plan row flips, and an `Upgrade proration`
  token adjustment lands. (Fails with the `subscription_update` products error → portal step 4 above.)
- **Downgrade an existing subscriber** → no navigation, a "Downgrade scheduled for <date>" toast, an
  amber banner on `/plan`, and NO charge/credit now. Confirm exactly one schedule exists in Stripe and
  the plan flips only when the period rolls. "Keep my current plan" → the schedule is released and the
  banner clears.
- **Cancel** (via the retention drawer's "Cancel anyway") → red "Subscription ending" banner,
  `cancel_at_period_end=true`, full access retained. **Resume subscription** → banner clears, no new
  charge. Confirm the sub was NOT deleted immediately.
- Top-up → tokens credited; a Stripe invoice is produced.
- Make an AI call → `token_balances.used_tokens` rises; `/billing/history` Used reflects it.
- (If enforced) drain to ~0 → the 402 gate + the low/out alert bar appear.
