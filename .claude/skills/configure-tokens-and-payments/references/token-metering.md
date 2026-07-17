# Token metering (make usage cost tokens, hack-proof)

Goal: every AI call **atomically logs and deducts** from the shared balance, so a user can't exceed
their allowance in this app or by switching apps. The authoritative total is in Supabase
`token_balances`; any client copy is display-only.

Reference: GraveLens `src/lib/tokenGate.ts`, `src/lib/lowhigh.ts`, `token_metering.sql`, and the AI
routes under `src/app/api/*`.

## The three RPCs (`token_metering.sql` — balance-only, `api_usage_log` insert stays in the app)

- `settle_token_usage(user, reserved, actual)` → `used_tokens = GREATEST(used − reserved + actual, 0)`.
- `reserve_tokens(user, amount)` → atomic conditional UPDATE: adds `amount` to `used` **iff** the
  balance covers it; returns `{ok, available_after}`. The row lock serializes concurrent calls,
  closing the check-then-act race.
- `release_tokens(user, amount)` → refund an unsettled reservation.

## Two phases, one flag

Deduction is **always on** (Phase A). Blocking is behind an app env flag
`<APP>_ENFORCE_TOKEN_GATE=true` (Phase B). Ship + validate Phase A before flipping enforcement.

**Phase A — deduct on use:** in `logUsage`, after inserting `api_usage_log`, call
`settle_token_usage(user, 0, actual)` where `actual = round(lowhigh_tokens)`. Skip team usage.
**Never let an unpriced model bill free:** if the model isn't in `ai_models`, compute the cost with
a conservative `FALLBACK_PRICING` (e.g. input $5/1M, output $15/1M, query $0.05) and log a warning.

**Phase B — atomic admission:** `admitAiCall(userId, route)` returns `{response, release}`:
- reserves `TOKEN_ESTIMATES[route]` via `reserve_tokens` when enforcing; returns a **402** if the
  balance can't cover it; admin/observe/no-config reserve nothing.
- On admit, the route schedules the refund on **every** exit path:
  ```ts
  const admit = await admitAiCall(userId, route);
  if (admit.response) return admit.response;
  if (admit.release) after(admit.release);   // always refunds the reservation
  ```
  Net effect = reserve(+est) − release(−est) + settle(+actual) = **actual on success, 0 on
  failure**, no leaks. Multi-event routes (one gate, several `logUsage`) net correctly because
  release runs once and each settle adds its own actual. Put the gate **after** any cache check so
  cache hits don't reserve.

`TOKEN_ESTIMATES` are conservative per-route guesses — **tune against real `ai_models` pricing**
before enabling enforcement, or reservations will be mis-sized.

## Low / out-of-tokens alerts (UX so running out isn't jarring)

- `EcosystemProvider.tokenAlert`: `computeAlertLevel(billing)` → `out` at `available ≤ 0`; `low`
  when `< 10%` of the plan allowance for subscribers, or `< ~one action (≈50k)` for free/reward-only
  users (a high floor nags them). Dismissible → persistent dot on `ProfileBadge`; auto-clears on
  recovery. Init dismissal via lazy `useState` (no setState-in-effect).
- `TokenAlertBar` renders a global header bar (low = gold, out = deeper burnt-amber — present, not
  alarming red). CTA: subscribers → `/topup`, free → `/billing`.

## Security notes to carry over

- Enforcement reads/writes the DB server-side only; client balance is never trusted.
- `admitAiCall` fails **open** on a billing-query error (availability over strictness) — a
  deliberate trade-off; state it.
- Ensure **every** AI-consuming route goes through `admitAiCall` + `logUsage`; an ungated AI call is
  a free-usage hole. (Non-LLM routes that don't spend tokens, e.g. external lookups, are exempt.)
