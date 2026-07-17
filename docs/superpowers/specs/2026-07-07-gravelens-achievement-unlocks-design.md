# GraveLens — Non-disruptive achievement unlocks

**Date:** 2026-07-07
**App:** GraveLens (only app with the achievement/rank unlock system)
**Status:** Approved design, ready for implementation plan

## Problem

When a user saves a grave, `checkAndUnlock()` evaluates ~80 achievements in one pass and can
return several newly-unlocked achievements at once. `ResultPage.tsx` renders **all of them
simultaneously** as a vertical stack of ~120px toasts (fixed bottom-left, z-index 50, auto-dismiss
after 5s). Saving a single Civil War grave can fire 4+ toasts that stack 600+px tall, cover the
mobile bottom nav, and vanish together. Users experience this as awkward and disruptive.

Current mechanism:
- `GraveLens/src/lib/achievements.ts` — `checkAndUnlock(graves, stats)` returns `Achievement[]`
  of newly-unlocked items; unlock records persist to `localStorage` under `gl_achievement_unlocks`.
- `GraveLens/src/components/results/ResultPage.tsx` (~L1594–1628) — dumps the array into a toast
  stack on a shared 5s timer.
- `GraveLens/src/components/achievements/AchievementsPage.tsx` — the real home ("History Explorer",
  `/explorer`), showing rank + achievement grid.
- Rank-ups separately grant one-time claimable token bonuses (`RANK_TOKEN_BONUS`, 5k–100k) surfaced
  on `/rewards`.

## Goals

- Remove the disruptive multi-toast stack; never cover the bottom nav.
- Give in-the-moment acknowledgment without demanding attention.
- Provide a persistent, non-disruptive cue that survives reloads and is consistent across devices.
- Preserve a real (but non-blocking) celebration for rare, high-value rank-ups.

Non-goals: sound/haptics, a confetti engine, changes to other apps, redesigning the Explorer grid.

## Design decisions (locked)

1. **Differentiate** minor achievements from rank-ups.
2. Minor achievements → **collapsed count toast + persistent Explorer nav badge**.
3. Clicking the toast/badge → **navigate to the existing History Explorer**, with a "Just unlocked"
   section pinned at top; then the badge clears.
4. Rank-ups → **one elevated (gold) hero toast**, non-blocking, persistent until dismissed, with a
   "Claim tokens" CTA to `/rewards`.
5. When a save triggers both a rank-up and minor achievements, the **hero toast takes precedence**
   (shown alone); minor unlocks still increment the badge silently.
6. **`seen` state is local-first and synced to the server** (Supabase) for cross-device consistency.
7. No blocking modals anywhere.

## The "unseen" state model (foundation)

Achievements are **derivable** from the grave collection, which already syncs to Supabase. So the
unlocked *set* is reproducible on any device by re-running `checkAndUnlock` against the user's
graves. The only state that is NOT reproducible and therefore must sync is **which unlocks the user
has seen** (plus unlock timestamps for display).

Model:
- Each unlock has a `seen: boolean`. Newly unlocked = `seen: false`.
- **Explorer nav badge count = number of unseen unlocks.**
- Opening `/explorer` (or expanding the "Just unlocked" section) marks the currently-unseen unlocks
  `seen`, clearing the badge.

### Persistence: local-first + server sync

- **Local (optimistic cache):** extend the `gl_achievement_unlocks` records with `seen` (and keep
  `unlockedAt`). Reads/writes stay synchronous so UI never blocks.
- **Server (source of truth for `seen`):** a per-user seen set in Supabase.
  - Proposed table (additive migration; must be verified against the LIVE Supabase schema first —
    repo migrations are known to drift):
    ```sql
    create table if not exists gl_achievement_seen (
      user_id        uuid not null references auth.users(id) on delete cascade,
      achievement_id text not null,
      unlocked_at    timestamptz not null default now(),
      seen_at        timestamptz,
      primary key (user_id, achievement_id)
    );
    -- RLS: user can select/insert/update only their own rows.
    ```
  - **Sync rules:**
    - On app load (authed): fetch the user's rows, **merge** with local. A row/achievement is
      considered seen if `seen_at` is non-null on either side (union of seen). Merge unlock
      timestamps by earliest.
    - On unlock: upsert row with `seen_at = null` (optimistically write local first, then server in
      the background).
    - On mark-seen: set `seen_at = now()` locally, then background-upsert to server.
  - **Offline / signed-out:** local cache is authoritative; queue writes and flush on next authed
    load. Never block UI on the network. (Follow the `offline-pwa-storage` and `api_architect`
    conventions — no bare empty catches; log failures.)

## Minor achievement flow

Replaces the toast stack in `ResultPage.tsx`:
- On a save unlocking N minor achievements, show **one** compact toast, top-center:
  - N == 1 → "🏅 Achievement unlocked — tap to view"
  - N  > 1 → "🏅 {N} achievements unlocked — tap to view"
  - Auto-dismiss ~5s.
- Simultaneously increment the Explorer nav badge to the unseen total.
- Tapping the toast → navigate to `/explorer` (new ones pinned; see below).
- If the toast is missed, the **badge persists** until the user opens Explorer.
- Never a vertical stack; never overlaps the bottom nav (top-center placement, single element).

## Rank-up flow

- Detect a rank-up by comparing derived rank (from total XP in `achievements.ts`) **before vs after**
  the save. Expose this from `checkAndUnlock` (or a sibling helper) so `ResultPage` can branch.
- Show **one elevated hero toast** (gold, glow, top placement) that does **not** auto-dismiss —
  requires tap/close: e.g. "Rank 4: Chronicler — 15,000 tokens ready to claim."
- Primary CTA **"Claim tokens"** → `/rewards`. Secondary dismiss.
- If the same save also unlocked minor achievements, show the **hero toast alone**; minor unlocks
  still increment the badge silently (no competing toasts).

## Explorer page changes

`AchievementsPage.tsx`:
- Add a **"Just unlocked"** section pinned above the grid, rendering the `unseen` achievements using
  the existing card UI (no new list component).
- On view (mount / section expand), mark those achievements `seen` (local + background server sync),
  which clears the nav badge.

## Components touched

- `GraveLens/src/lib/achievements.ts`
  - Extend `UnlockRecord` with `seen`.
  - Add helpers: `unseenCount()`, `markSeen(ids)`, and a rank-change signal (return `{ newUnlocks,
    rankUp }` from a new/updated function, or a sibling to `checkAndUnlock`).
  - Add server sync utilities (fetch/merge/upsert) guarded for signed-out/offline.
- `GraveLens/src/components/results/ResultPage.tsx`
  - Replace the toast-stack block with: rank-up → hero toast; else → single count toast; always
    update badge state.
- **New** `AchievementToast` component (two variants: `count`, `hero`), portaled to `document.body`
  and positioned per the project's overlay/modal rules (no transform-based centering; use the
  OverlayContext pattern so it never collides with global FABs).
- `GraveLens/src/components/layout/BottomNav.tsx` + `DesktopNav.tsx`
  - Badge on the Explorer / "History Explorer" link bound to `unseenCount()`.
- `GraveLens/src/components/achievements/AchievementsPage.tsx`
  - "Just unlocked" section + mark-seen on view.

## Data flow

1. Save grave → `checkAndUnlock` computes `newUnlocks` + `rankUp`, writes local records
   (`seen:false`), background-upserts to Supabase.
2. `ResultPage` branches: rank-up hero toast, or count toast; badge state recomputes from
   `unseenCount()`.
3. Nav badge reflects unseen total across reloads/devices (via server merge on load).
4. User opens `/explorer` → "Just unlocked" renders unseen items → marks them seen (local + server)
   → badge clears everywhere.

## Error handling

- All network calls: retry with backoff, log failures (no empty catches). UI never blocks on sync;
  local cache is always authoritative for rendering.
- Signed-out users: fully functional locally; sync queued and flushed on next authed load.
- Merge is idempotent (seen = union; timestamps = earliest) so repeated syncs converge.

## Testing

- Unit: `unseenCount`, `markSeen`, merge logic (union of seen, earliest timestamp), rank-change
  detection across XP thresholds.
- Component: count toast copy for N==1 vs N>1; hero toast precedence when rank-up + minors coincide;
  toast never renders a stack.
- Integration: badge persists across reload; clears after visiting `/explorer`; two-device sim
  (seen on device A → badge cleared on device B after load merge).

## Manual / out-of-band steps (owner: user)

- Verify the `gl_achievement_seen` table against the **live** Supabase schema before applying;
  create the additive migration + RLS policies in Supabase.
- Confirm the Explorer nav link labels/targets on both mobile and desktop.

## Out of scope

Sound/haptics; confetti; server-side sync of the full unlock set (derived from graves instead);
changes to LowHigh 1.0 / Website / Pre-Release; Explorer grid redesign.
