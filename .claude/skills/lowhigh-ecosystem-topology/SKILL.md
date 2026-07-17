---
name: lowhigh-ecosystem-topology
description: Read FIRST whenever a task touches more than one app folder, deployment domains, auth/SSO, shared accounts/tokens/billing, or "which project serves lowhigh.ai". Explains how the LowHigh monorepo's apps, domains, and Supabase backend relate so it never has to be re-derived.
metadata:
  type: reference
---

# LowHigh Ecosystem Topology

The monorepo has five app folders but **only three production domains**. Most cross-app confusion
comes from not knowing that three of the folders are *stages of the same site*.

## The three domains

| Domain | App | What it is |
|---|---|---|
| **lowhigh.ai** | the LowHigh **account site** | One site, evolving through three folder stages (below). Owns the user account, subscription, token balance, rewards. |
| **gravelens.com** | **GraveLens** | A **separate** app (headstone scanner). Spends the shared account's tokens; does not own the account. |
| **(TBD — Antisocial)** | **Antisocial** (`Antisocial/`) | The personalized feed app, extracted from LowHigh Website. Standalone like GraveLens: own domain + Vercel project, self-hosted billing, spends shared tokens. Admin-only gate at launch (`lowhigh_admins.is_active` → coming-soon page for everyone else). Brand has no hyphen; internal appSlug stays `anti-social`. |

There is no fourth domain. "GraveLens, Antisocial, LowHigh 1.0, LowHigh Website" = two satellite
apps (one domain each) plus two stages of the lowhigh.ai site (same domain).

## lowhigh.ai is one site in three folder stages

```
LowHigh Pre-Release/   →   LowHigh 1.0/   →   LowHigh Website/
  (DEPLOYED now)            (next, WIP)         (full version, future)
```

- **`LowHigh Pre-Release/`** — what is **live at lowhigh.ai today**. Static multi-page Vite HTML +
  dual API layers (`api/*.js` for `vercel dev`, `server/index.js` for `npm run dev` — keep both in
  sync; see memory `project_prerelease_architecture`).
- **`LowHigh 1.0/`** — the in-progress upgrade of Pre-Release into a **minimal account app**
  (login / subscribe / account / token balance / rewards / tickets / delete). This is what replaces
  Pre-Release at lowhigh.ai **next**. `.vercel/project.json` → `projectName: "lowhigh.ai"`. Scope and
  exclusions in memory `project_lowhigh_1_0_scope`. Account screens are ported (trimmed) from
  `LowHigh Website/src/`.
- **`LowHigh Website/`** — the **full** multi-app product (in-site apps, store, Resources,
  personalization). **Not deployed yet**; the eventual future of lowhigh.ai. NOTE: project-root
  `CLAUDE.md` calls this "THE ACTUAL APP" — that guidance predates the staged plan; for ecosystem/SSO
  work treat 1.0 as the near-term lowhigh.ai and Website as its future.

**Rule of thumb:** changes meant to ship to lowhigh.ai go into whatever stage is being built/deployed
for that work — usually **LowHigh 1.0** now. If a change must persist across the rollout (e.g. the SSO
broker, the GraveLens-facing API endpoints), put it in **both 1.0 and Website** and keep them in sync.

## Shared backend

All five folders use **one Supabase project** (same `*_SUPABASE_URL` / anon key — values live in
Vercel cloud, never in `.env`; see memory `feedback_no_env_files`). So a user is the **same account**
everywhere; only the live *browser session* differs per origin.

| | lowhigh.ai stages (Pre-Release / 1.0 / Website) | GraveLens | Antisocial |
|---|---|---|---|
| Frontend | Vite React SPA | Next.js (App Router) PWA | Vite React SPA |
| Supabase client | `@supabase/supabase-js` (**localStorage** sessions) | `@supabase/ssr` (**cookie** sessions) | `@supabase/supabase-js` (**localStorage** sessions) |
| Server auth | `api/_utils/verifyUser.js` / `security.js` (service-role client + Bearer verify) | `src/lib/apiAuth.ts` `requireAuth()` | inline Bearer verify per edge route + `api/_utils/adminGate.js` (launch gate) + `verifyUser.js` for billing |
| Login methods | password + magic link + Google + reset (already wired) | password only (being brought to parity) | password + magic link + Google + reset (ported from 1.0) |

## Cross-app auth / SSO

- Different root domains ⇒ **no shared cookie**; iframe/credentialed-fetch SSO fails under Safari/iOS
  third-party-cookie blocking (GraveLens is an iOS PWA). The ecosystem uses **top-level-redirect SSO**
  with a central first-party `lh_sso` cookie + `/api/sso/*` broker on **lowhigh.ai** (the authority).
  GraveLens and each lowhigh.ai stage are clients that bounce through it on load/login.
- GraveLens authorizes its cross-origin calls with the shared Supabase JWT as a Bearer token; the
  lowhigh.ai side allowlists satellite origins (GraveLens AND Antisocial) via
  `GRAVELENS_ALLOWED_ORIGINS` in `api/_utils/cors.js` (env-driven; adding a satellite is a Vercel
  env edit on the lowhigh.ai project, no code change).
- Antisocial is a second SSO satellite: `Antisocial/src/lib/ssoClient.ts` (fail-open, gated behind
  `VITE_LOWHIGH_SSO_ENABLED`), same bounce flow as GraveLens.
- GraveLens reaches lowhigh.ai via `NEXT_PUBLIC_LOWHIGH_API_BASE` (→ `https://www.lowhigh.ai`). The
  GraveLens-facing endpoints (`app-open.js`, `billing-subscription.js`, `billing/[action].js`, the
  CORS util) historically live in **LowHigh Website**; they must exist on whatever is **deployed at
  lowhigh.ai** (currently Pre-Release / next 1.0) for GraveLens to actually link.

## Quick disambiguation

- "the live site" / "what's at lowhigh.ai now" → **LowHigh Pre-Release**.
- "1.0" / "the account app we're shipping" → **LowHigh 1.0**.
- "the full app" / "the website" → **LowHigh Website** (future).
- "GraveLens" → the separate gravelens.com app.
- "Antisocial" / "Anti-Social" / "the feed" → the standalone `Antisocial/` app (own domain, TBD).
  The old in-Website copy at `LowHigh Website/src/apps/anti-social` is DELETED; legacy routes
  redirect out via `LowHigh Website/src/config/antisocial.ts`.
- "the LowHigh account/tokens/subscription" → one Supabase project, shared by all of the above.

## Adding a signup-capable site

All apps share ONE Supabase project, so they share ONE set of Auth email templates. Those
templates route the confirmation link back to the right brand using per-app **signup metadata**,
and every app confirms via **`token_hash` + `verifyOtp`** (works cross-device; a `?code=` PKCE link
does NOT, because the verifier only exists in the origin browser). Any new app where users can sign
up MUST wire all of the following, or its confirmation emails break:

1. **Signup metadata** — pass these in `signUp` `options.data` (see GraveLens `LoginPage.tsx`,
   LowHigh 1.0 / Website `AuthContext.tsx` `signUp`):
   - `app_base_url` — canonical `*_PUBLIC_SITE_URL` env, fallback `window.location.origin`. The email
     link is built from `{{base_url}}` → `{{ .Data.app_base_url }}` (with `{{ .SiteURL }}` fallback).
   - `app_name` — the brand string ("GraveLens", "LowHigh"). Email copy uses `{{app_name}}`
     → `{{ .Data.app_name }}` (fallback "LowHigh"). Token map: `LowHigh Website/src/apps/email/services/supabaseAuthTokens.ts`.
2. **`/auth/callback` route** — reads `token_hash`, `type` (default `email`), `next`; calls
   `supabase.auth.verifyOtp({ token_hash, type })`; then reacts via the app's normal post-auth path
   (SPAs: full `window.location.replace(next)` / `navigate(next)` so the auth context re-hydrates;
   Next.js/GraveLens: `router.replace(next)`). Do NOT also call `exchangeCodeForSession` on a `?code=`
   branch when the client has `detectSessionInUrl: true` — it double-spends the verifier
   ("PKCE code verifier not found"). `@supabase/ssr`'s `createBrowserClient` forces
   `detectSessionInUrl: true` and it cannot be overridden.
3. **SSO push** (lowhigh.ai clients + GraveLens only) — on a fresh session call
   `establishCentralSession`. Sites with no `ssoClient` (e.g. LowHigh Website today) skip this.
4. **Env** — set `*_PUBLIC_SITE_URL` in the site's Vercel project so `app_base_url` is the canonical
   domain, not a preview URL baked into a user's metadata.
5. **Shared email templates** — the Supabase Auth CTAs are
   `{{base_url}}/auth/callback?token_hash={{token_hash}}&type=<email|magiclink|recovery|email_change>&next=/app`
   (recovery routes `next=/reset-password`). Never `{{confirmation_url}}`. Authored in the admin email
   builder, exported via "Copy for Supabase", pasted into Supabase → Authentication → Email Templates.
6. **appSlug** — register the app in the appSlug registry (`appSlugMap.js` / `appSlug.ts`) if it
   participates in the store / usage tracking.

**Rollout order:** deploy all apps' callback + signup-metadata changes FIRST, verify, THEN switch the
Supabase dashboard templates. Switching templates first breaks apps that don't yet handle `token_hash`.
