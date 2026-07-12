# GraveLens — Web App → Native iOS & Android Plan

**Approach:** Capacitor wrapper. The existing Next.js client is statically exported and bundled inside native iOS/Android shells. The API routes (`/api/analyze`, `/api/lookup`, `/api/tts`, etc.) stay deployed on Vercel and are called remotely. ~90% of the codebase is reused; the web app continues to work unchanged.

**Status legend:** `[ ]` todo · `[~]` in progress · `[x]` done. Each phase is independently completable — work top to bottom.

---

## Architecture Snapshot: What Transfers, What Breaks

| Component | Today | In Capacitor | Action needed |
|---|---|---|---|
| UI (React client components) | Next.js App Router | Works as-is in webview | None |
| API routes (`src/app/api/*`) | Vercel serverless | **Cannot be bundled** — stay on Vercel, called cross-origin | CORS + absolute API base URL |
| Auth (`@supabase/ssr`, cookies) | Cookie-based SSR session | **Breaks** — no cookies on `capacitor://` origin | Switch native to bearer-token auth |
| Google OAuth login | Redirect/popup flow | **Breaks** — needs in-app browser + deep link return | `@capacitor/browser` + deep links; add Sign in with Apple (App Store requirement) |
| Dynamic routes `/result/[id]`, `/grave/[id]` | Server-rendered params | **Breaks static export** | Convert to query params (`/result?id=`) |
| Camera (`<input capture="environment">`) | HTML file input | Works, but mediocre UX | Upgrade to `@capacitor/camera` |
| EXIF GPS via `exifr` | Reads GPS from photo files | Camera plugin photos may lack GPS EXIF | Tag location via `@capacitor/geolocation` at capture time |
| IndexedDB (`src/lib/storage.ts`, `idb`) | Browser IDB | Works in webview; iOS can evict under storage pressure | Acceptable (cloud sync is the backstop); note in risks |
| Offline queue (`src/lib/queue.ts`) | IDB + app-code processing | Works (not SW-dependent) | Verify connectivity detection via `@capacitor/network` |
| Service worker (`public/sw.js`, `sw-register.tsx`) | Asset caching + update detection | **Unnecessary & unreliable** in WKWebView | Skip registration when `Capacitor.isNativePlatform()` |
| PWA update check (`/api/version` + `NEXT_PUBLIC_BUILD_TIME`) | Detects new deploys | Wrong model — native updates via stores | Gate off in native; store releases (or Live Updates later) |
| Leaflet maps | Network tiles | Works | None |
| tesseract.js (WASM) | Browser WASM | Works; test perf on older devices | Test only |
| TTS audio + IDB cache | `/api/tts` + IndexedDB | Works | Test audio playback w/ screen lock |
| Tailwind 4 / CSS vars theming | — | Works | Safe-area insets (Phase 4) |

---

## Phase 0 — Accounts & Tooling (can run in parallel with Phase 1)

**Cost summary: $99/yr (Apple) + $25 one-time (Google) = ~$124 first year.**

- [ ] **0.1** Enroll in the [Apple Developer Program](https://developer.apple.com/programs/enroll/) — $99/yr. Use a personal Apple ID (individual enrollment; D-U-N-S only needed for org accounts). Approval can take 1–2 days.
- [ ] **0.2** Create a [Google Play Console](https://play.google.com/console/signup) developer account — $25 one-time. **Note:** personal accounts created after Nov 2023 must run a closed test with ≥12 testers for 14 days before production release. Start this clock early.
- [ ] **0.3** Install Xcode from the Mac App Store (large download; do this early). Run `xcode-select --install` for CLI tools. Accept license: `sudo xcodebuild -license accept`.
- [ ] **0.4** Install Android Studio (https://developer.android.com/studio). During setup install: Android SDK, SDK Platform (API 34+), Android Emulator. Add to shell profile:
  ```sh
  export ANDROID_HOME=$HOME/Library/Android/sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```
- [ ] **0.5** Install CocoaPods if missing: `brew install cocoapods` (Capacitor iOS uses it, or SPM — Capacitor 6+ supports SPM; prefer SPM if the Capacitor version allows).
- [ ] **0.6** Verify environment: `npx cap doctor` (after Phase 2.1) reports no errors.
- [ ] **0.7** Decide the app ID (reverse-DNS, permanent, cannot change after store publish). Suggested: `app.gravelens` or `com.luebbert.gravelens`. Register the bundle ID in the Apple Developer portal.

---

## Phase 1 — Codebase Prep (all changes keep the web app working)

Goal: the Next.js app builds as a static export (`next build` with `output: "export"`) and all server dependencies are reachable cross-origin.

### 1.1 Static export audit & dynamic route conversion
- [ ] **1.1.1** Convert `/result/[id]` → `/result?id=<id>`. The page reads `useSearchParams()` instead of route params. Update every `router.push`/`<Link>` that targets it (grep for `"/result/`).
- [ ] **1.1.2** Convert `/grave/[id]` → `/grave?id=<id>` the same way. Keep old paths working on the web with a client-side redirect if shared links exist in the wild.
- [ ] **1.1.3** Add export config to `next.config.ts`, gated by env so the Vercel web deploy is untouched:
  ```ts
  const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";
  const nextConfig: NextConfig = {
    ...(isCapacitorBuild ? { output: "export" as const, images: { unoptimized: true } } : {}),
    // ...existing config
  };
  ```
- [ ] **1.1.4** Run `CAPACITOR_BUILD=1 npm run build` and fix every export error. Expected offenders: any use of `next/headers`, server actions, route handlers imported into pages, `next/image` optimization, dynamic OG image routes (`apple-icon.tsx`, `icon.tsx`, `opengraph-image.png` — these are fine to lose in the native bundle; exclude or ignore).
- [ ] **1.1.5** Confirm output lands in `out/` and the app boots from a plain static file server: `npx serve out`.

### 1.2 API base URL indirection
- [ ] **1.2.1** Create `src/lib/apiBase.ts`:
  ```ts
  export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
  export const apiUrl = (path: string) => `${API_BASE}${path}`;
  ```
- [ ] **1.2.2** Replace every `fetch("/api/...")` in client code with `fetch(apiUrl("/api/..."))`. Grep: `grep -rn '"/api/' src/components src/lib src/hooks src/app --include="*.tsx" --include="*.ts"`. Per `api_architect` skill: keep existing retry/error handling intact while touching these call sites.
- [ ] **1.2.3** Set `NEXT_PUBLIC_API_BASE=https://<production-domain>` in the Capacitor build env (e.g. `.env.capacitor`), empty for web builds.

### 1.3 Auth rework: cookie → bearer token (dual-mode)
The native app cannot use `@supabase/ssr` cookie sessions. Native clients authenticate with the Supabase JS client storing the session locally, and send `Authorization: Bearer <access_token>` to the Vercel API routes.

- [ ] **1.3.1** In `src/lib/apiAuth.ts`, extend `requireAuth()` to accept a bearer token before falling back to cookies:
  ```ts
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const { data, error } = await supabaseAdmin.auth.getUser(authHeader.slice(7));
    if (!error && data.user) return { user: data.user };
  }
  // ...existing cookie path
  ```
  (Requires a Supabase client created with the anon key + the token, or `auth.getUser(jwt)` on a service client — follow the `supabase` skill for the current recommended pattern.)
- [ ] **1.3.2** In the browser Supabase client (`src/lib/supabase/browser.ts`), when running natively, configure explicit storage so sessions survive webview restarts — use `@capacitor/preferences` as a custom storage adapter (`auth: { storage: preferencesAdapter, persistSession: true, autoRefreshToken: true }`).
- [ ] **1.3.3** Add a fetch wrapper (or extend `apiUrl` usage) that attaches the current session's access token as `Authorization` header on native. Centralize in one place — e.g. `src/lib/apiFetch.ts` — rather than per-call-site.
- [ ] **1.3.4** Verify token refresh: leave the app idle > 1 hour, confirm API calls still succeed (autoRefreshToken should handle it; test it).

### 1.4 CORS on the Vercel API
- [ ] **1.4.1** Add CORS handling for the native origins — `capacitor://localhost` (iOS) and `https://localhost` (Android) — to all `/api/*` routes. Cleanest: Next.js middleware or a shared helper that sets `Access-Control-Allow-Origin` (echo the allowed origin), `-Headers: authorization, content-type`, `-Methods: POST, GET, OPTIONS`, and answers `OPTIONS` preflight with 204. **Do not use `*`** with credentials.
- [ ] **1.4.2** Confirm the third-party proxied calls (`src/proxy.ts`, external genealogical APIs) are all server-side — they are — so no additional CORS exposure.
- [ ] **1.4.3** Security check (`security_auditor` skill): bearer-token acceptance must not weaken auth — token is validated against Supabase on every request, no token logging, 401 on failure.

### 1.5 Platform gating utilities
- [ ] **1.5.1** Create `src/lib/platform.ts`:
  ```ts
  import { Capacitor } from "@capacitor/core";
  export const isNative = () => Capacitor.isNativePlatform();
  export const platform = () => Capacitor.getPlatform(); // "ios" | "android" | "web"
  ```
- [ ] **1.5.2** In `src/app/sw-register.tsx`: skip service worker registration when `isNative()`.
- [ ] **1.5.3** Gate the `/api/version` PWA-update banner off on native (updates come from the stores).
- [ ] **1.5.4** Gate the "Add to Home Screen" / install prompts in `OnboardingCarousel.tsx` off on native.

---

## Phase 2 — Capacitor Integration

- [ ] **2.1** Install: `npm i @capacitor/core @capacitor/cli && npx cap init GraveLens <app-id-from-0.7> --web-dir=out`
- [ ] **2.2** Add platforms: `npm i @capacitor/ios @capacitor/android && npx cap add ios && npx cap add android`. Commit the generated `ios/` and `android/` directories (they are source, not artifacts — plugins and config live there).
- [ ] **2.3** Configure `capacitor.config.ts`:
  ```ts
  const config: CapacitorConfig = {
    appId: "<app-id>",
    appName: "GraveLens",
    webDir: "out",
    android: { allowMixedContent: false },
    ios: { contentInset: "automatic" },
  };
  ```
  Do **not** set `server.url` to the remote site — Apple rejects thin web wrappers (Guideline 4.2); assets must be bundled.
- [ ] **2.4** Add npm scripts:
  ```json
  "build:native": "CAPACITOR_BUILD=1 next build && npx cap sync",
  "ios": "npm run build:native && npx cap open ios",
  "android": "npm run build:native && npx cap open android"
  ```
- [ ] **2.5** First boot: run on iOS Simulator and Android emulator. Verify: app loads, login works (may still be broken until 3.3 deep links — email/password should work), archive renders from IndexedDB, maps render.
- [ ] **2.6** Test on real devices (camera & GPS don't exist in simulators): enable Developer Mode on iPhone, USB debugging on Android.

---

## Phase 3 — Native Capability Upgrades

### 3.1 Camera & photos
- [ ] **3.1.1** `npm i @capacitor/camera && npx cap sync`. In `CapturePage.tsx`, when `isNative()`, replace the file input with `Camera.getPhoto({ resultType: CameraResultType.DataUrl, source: CameraSource.Camera, quality: 90 })`. The existing `preprocessAndResize` pipeline consumes the data URL unchanged. Keep the file-input path for web.
- [ ] **3.1.2** **GPS tagging:** `Camera.getPhoto` does not reliably return EXIF GPS. Install `@capacitor/geolocation`; at capture time call `Geolocation.getCurrentPosition({ enableHighAccuracy: true })` and attach lat/lng to the record directly, bypassing the `exifr` path on native. Keep `exifr` for gallery-picked photos (which retain EXIF on iOS when using `CameraSource.Photos` with `allowEditing: false` — verify).
- [ ] **3.1.3** iOS `Info.plist` usage strings (Xcode → ios/App/App/Info.plist) — Apple rejects vague ones:
  - `NSCameraUsageDescription`: "GraveLens uses the camera to photograph headstones for transcription and research."
  - `NSPhotoLibraryUsageDescription`: "Choose existing headstone photos to analyze."
  - `NSLocationWhenInUseUsageDescription`: "Your location tags where each headstone was found and powers the cemetery map."
- [ ] **3.1.4** Android permissions are added by the plugins in `AndroidManifest.xml` — verify `CAMERA`, `ACCESS_FINE_LOCATION` are present after sync.

### 3.2 Device integration plugins
- [ ] **3.2.1** `@capacitor/status-bar` + `@capacitor/splash-screen`: match the app's stone-dark theme (`--t-stone-900`); hide splash after first render.
- [ ] **3.2.2** `@capacitor/network`: replace `navigator.onLine` checks in `src/lib/queue.ts` connectivity detection with `Network.addListener("networkStatusChange", ...)` on native (webview `online` events are unreliable).
- [ ] **3.2.3** `@capacitor/app`: handle Android hardware back button (`App.addListener("backButton")`) — pop in-app navigation; exit app only from the home screen.
- [ ] **3.2.4** `@capacitor/haptics`: light impact on capture success (optional polish).
- [ ] **3.2.5** `@capacitor/preferences`: used by 1.3.2 for auth session storage.
- [ ] **3.2.6** Generate icons/splash: `npm i -D @capacitor/assets`, place a 1024×1024 icon + 2732×2732 splash source in `assets/`, run `npx capacitor-assets generate`.

### 3.3 OAuth & deep links
- [ ] **3.3.1** Add the custom scheme (e.g. `app.gravelens://auth-callback`) to iOS (URL Types in Xcode) and Android (intent filter in `AndroidManifest.xml`).
- [ ] **3.3.2** Native Google login flow: open the Supabase OAuth URL with `@capacitor/browser` (in-app browser tab), set `redirectTo: "app.gravelens://auth-callback"`, add that URL to Supabase Auth → Redirect URLs. On `App.addListener("appUrlOpen")`, extract the code and call `supabase.auth.exchangeCodeForSession(code)`. Rework `src/app/auth/callback/page.tsx` logic into a shared handler.
- [ ] **3.3.3** **Sign in with Apple (mandatory):** App Store Guideline 4.8 — because the app offers Google login, it must offer Sign in with Apple (or equivalent privacy-preserving login). Enable the Apple provider in Supabase Auth, add the capability in Xcode, use the same deep-link flow. Show the Apple button on iOS at least.
- [ ] **3.3.4** (Later, optional) Universal Links / App Links so `https://<domain>/grave?id=...` opens the app.

### 3.4 Push notifications (optional — defer unless there's a concrete use)
- [ ] **3.4.1** Only build this when there's a real trigger (e.g. "your queued scans finished syncing", memorial dates). Requires `@capacitor/push-notifications`, an APNs key, Firebase Cloud Messaging for Android, and a server-side sender (Supabase Edge Function). Skip for v1.

---

## Phase 4 — Native UX Polish

- [ ] **4.1** Safe areas: audit every fixed header/footer/bottom-nav for `env(safe-area-inset-*)` padding. Add `viewport-fit=cover` to the viewport meta in `src/app/layout.tsx`. Test on a notched iPhone and a gesture-nav Android.
- [ ] **4.2** Keyboard: verify inputs aren't obscured (name editing in ResultPage, search in ArchivePage). `@capacitor/keyboard` with `resize: "body"` if needed.
- [ ] **4.3** Disable webview artifacts: user-select on non-text UI, tap-highlight (`-webkit-tap-highlight-color: transparent`), overscroll bounce where it looks broken, long-press image save context menu on the capture view.
- [ ] **4.4** Account deletion (App Store **requirement** — Guideline 5.1.1(v)): the app supports account creation, so it must offer in-app account deletion. Add a settings action that deletes the Supabase user (service-role Edge Function or admin API), their storage objects, and rows. This blocks iOS approval — do not skip.
- [ ] **4.5** External-link handling: Apple Maps / Google Maps / Wikipedia links from ArchiveMap popups should open via `@capacitor/browser` or the system (`window.open` gets intercepted — verify each).
- [ ] **4.6** App display name, version (`CFBundleShortVersionString` / `versionName`), and build number wiring — decide a scheme (e.g. keep in sync with `package.json` version via `npx capacitor-set-version`).

---

## Phase 5 — Testing (apply `e2e_value_verification` skill: aggressive paths, not happy paths)

Device matrix: oldest supported iPhone you can get (iOS 16+), a recent iPhone, a low-end Android, a recent Android.

- [ ] **5.1** Full capture flow on device: camera → preprocess → analyze → result → archive. Verify Haiku→Sonnet escalation works over cellular.
- [ ] **5.2** Offline: airplane mode → capture 3 stones → verify queue populates → restore connectivity → verify `queue.ts` processes and records land in archive with cloud sync.
- [ ] **5.3** Auth: fresh install login (email, Google, Apple), token refresh after 1h+ idle, logout/login cycles, account deletion.
- [ ] **5.4** Data durability: force-quit mid-sync, reinstall app → verify cloud restore repopulates the archive.
- [ ] **5.5** Multi-person stones, Working Scans review flow, TTS playback (incl. with screen locked / silent switch on iOS).
- [ ] **5.6** Maps: GPS acquisition cold-start time in a real cemetery (no wifi assist), tile loading on cellular.
- [ ] **5.7** Memory/perf: tesseract.js WASM and image preprocessing on the low-end Android; watch for webview OOM on large photos.
- [ ] **5.8** Light/dark mode switch, rotation lock behavior, interruption (phone call during capture).

---

## Phase 6 — Store Preparation & Submission

### Shared
- [ ] **6.1** Privacy policy page hosted at a public URL (required by both stores). Must cover: photos, location, account data, Claude/Anthropic processing, third-party genealogical APIs, data retention/deletion.
- [ ] **6.2** Store assets: app icon, screenshots (iPhone 6.7" + 5.5" or 6.5"; Android phone + optional tablet), short & full descriptions, feature graphic (Android, 1024×500). Screenshot the real app in a cemetery-styled demo dataset.
- [ ] **6.3** Content rating: expect a benign rating, but the death/memorial theme may prompt questionnaire nuance — answer honestly; it's reference/lifestyle content, not violence.

### iOS
- [ ] **6.4** App Store Connect: create the app record with the bundle ID from 0.7.
- [ ] **6.5** Privacy "nutrition label": declare Photos, Precise Location, Email/User ID, User Content; mark linked-to-identity where cloud-synced. Declare Anthropic as a processor if asked about third-party data sharing.
- [ ] **6.6** TestFlight: archive in Xcode → upload → internal testing. Run the Phase 5 matrix from TestFlight builds (release mode differs from dev).
- [ ] **6.7** App Review notes: provide a demo account (email/password), explain that headstone photos are sent to a vision AI for transcription, and pre-empt Guideline 4.2 by listing native capabilities used (camera, geolocation, offline storage, Sign in with Apple). Mention 4.8 and 5.1.1(v) compliance explicitly.
- [ ] **6.8** Submit. Expect 1–3 day review; budget for one rejection cycle (most common first-app rejections: 4.2 minimum functionality, missing account deletion, vague permission strings — all addressed above).

### Android
- [ ] **6.9** Generate an upload keystore, configure signing in `android/app/build.gradle`, enable Play App Signing. **Back up the keystore + passwords in a password manager — losing it is unrecoverable.**
- [ ] **6.10** Build `.aab`: Android Studio → Build → Generate Signed Bundle.
- [ ] **6.11** Play Console: create app, complete Data Safety form (photos, location, personal info; encrypted in transit; deletable), content rating questionnaire, target-audience declaration.
- [ ] **6.12** Closed testing track: recruit 12+ testers, run 14 days (per 0.2 requirement for new personal accounts). Use this window to soak-test.
- [ ] **6.13** Promote to production.

---

## Phase 7 — Post-Launch Operations

- [ ] **7.1** Release process doc: version bump → `npm run build:native` → archive both platforms → upload. Web-only changes still ship instantly via Vercel; remember native bundles snapshot the client, so **client fixes require store releases** (JS-only changes can later use Capacitor Live Updates / Capgo if release cadence hurts — evaluate after a month).
- [ ] **7.2** Crash/error visibility: at minimum, Sentry's Capacitor SDK (free tier) — webview JS errors are otherwise invisible post-launch.
- [ ] **7.3** API cost guardrail: store users can now scale usage. Add per-user daily scan limits in `requireAuth()`/route handlers *before* launch if the app is public (see Monetization).
- [ ] **7.4** Monitor Apple/Google policy emails; annual Apple membership renewal ($99) lapses = app removed.

---

## Appendix A — Monetization Options (decision deferred)

Context: every scan costs real money (Claude Haiku/Sonnet vision + TTS). Apple/Google **require IAP for digital goods/features** (no Stripe links for unlocking app functionality; Apple's US anti-steering rules allow external-link *display* but the practical path is IAP). All options below assume **RevenueCat** (free < $2.5k MTR) to avoid hand-rolling StoreKit + Play Billing + receipt validation; entitlements get checked server-side in `requireAuth()`/route guards.

| Model | Shape | Pros | Cons | Fit |
|---|---|---|---|---|
| **A. Free + private** | No monetization; usage capped per account; you eat API costs | Ship fastest; simplest review | Costs scale with users; must add hard quotas | Best for v1 / family use |
| **B. Freemium subscription** | N free scans/month; $3–6/mo or $25–40/yr unlocks more scans + TTS + stories | Recurring revenue; standard genealogy-app pattern (Ancestry, FindAGrave ecosystem users expect subs) | 15–30% store cut; churn management; needs entitlement + quota plumbing | Best long-term |
| **C. Scan credits (consumable IAP)** | Buy packs (e.g. 50 scans/$4.99); credit ledger in Supabase | Costs perfectly hedged; no churn pressure | Consumables are the most fraud/refund-fiddly IAP type; worse LTV; ledger + receipt validation work | Good if usage is bursty (vacation cemetery trips) |
| **D. One-time unlock** | Paid app or single "Pro" unlock | Simple | Unbounded API liability per user — **dangerous** with per-scan costs | Avoid |

**Recommendation to evaluate later:** launch with A (quota: e.g. 25 scans/mo/user) → add B once there are real users. Design the quota check now (7.3) so B is a config change, not a rebuild.

## Appendix B — Key Risks

1. **Apple 4.2 "minimum functionality"** — biggest rejection risk for webview apps. Mitigation: bundled assets (no remote `server.url`), native camera/GPS/haptics, offline mode, Sign in with Apple. GraveLens's offline queue + camera pipeline is a genuinely strong case; make it visible in review notes.
2. **iOS IndexedDB eviction** — WKWebView storage can be purged under disk pressure. Mitigation: cloud sync already exists; consider `@capacitor-community/sqlite` migration only if real-world loss is observed.
3. **Auth dual-mode complexity** — bearer path (native) and cookie path (web) must both stay green. Mitigation: 1.3.1 keeps cookie fallback; add both paths to any API testing checklist.
4. **Google Play 12-tester/14-day gate** — schedule risk for new personal accounts. Start Phase 0.2 immediately.
5. **Static export regressions** — future Next.js features (server actions, `next/headers`) silently break the native build. Mitigation: add `CAPACITOR_BUILD=1 next build` to CI.

## Appendix C — Rough Effort Map

| Phase | Effort (focused sessions) |
|---|---|
| 0 Accounts/tooling | 1 session + waiting on approvals |
| 1 Codebase prep | 3–5 sessions (auth rework is the bulk) |
| 2 Capacitor shell | 1–2 sessions |
| 3 Native capabilities | 3–4 sessions (OAuth/deep links is the bulk) |
| 4 Polish + account deletion | 2–3 sessions |
| 5 Testing | 2–3 sessions + real-cemetery field test |
| 6 Store submission | 2 sessions + review wait (+14-day Play test window) |

**Realistic calendar time: 4–8 weeks part-time, gated mostly by store review cycles and the Play testing window.**
