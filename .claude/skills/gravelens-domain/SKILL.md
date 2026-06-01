---
name: gravelens-domain
description: GraveLens project architecture reference. Read at the start of any session touching vision analysis, image preprocessing, storage, auth, multi-person stones, or the Working Scans flow. Documents non-obvious decisions that would otherwise be re-derived from source each session.
---

# GraveLens Domain Knowledge

## 1. Vision Pipeline (Haiku → Sonnet escalation)

**Route:** `src/app/api/analyze/route.ts`

Auth guard runs first (`requireAuth()` from `src/lib/apiAuth.ts`), then payload size check (10.7 M char cap = ~8 MB raw), then Haiku.

Escalation to Sonnet triggers when ANY of:
- Haiku call throws (parse failure / network error)
- `confidence === "low"`
- `name == null` (empty string counts)
- `birthYear == null && deathYear == null` (use `== null`, not `!` — year 0 is valid)

`normalizeExtractedNames()` runs on the final result before returning — applies `toNameCase()` to name fields. **`toNameCase` is duplicated in ResultPage.tsx** (display-only); if the casing logic ever changes, update both.

## 2. Image Preprocessing Pipeline

**Must stay in sync across two files:**

| File | Function | Called from |
|---|---|---|
| `src/components/capture/CapturePage.tsx` | `preprocessAndResize(dataUrl, maxPx=1568)` | Live captures |
| `src/lib/queue.ts` | `preprocessForClaude(dataUrl)` | Offline queue retries |

Both run the same 3-step pipeline:
1. Global contrast stretch (luma min/max → remap)
2. `localContrastBoost(data, w, h)` — CLAHE-lite, 8×8 tile grid
3. `unsharpMask(data, w, h, 0.5)` — pixel-level, 0.5 strength

Both import from `src/lib/relief.ts`. Max resolution: 1568 px (Claude's native max). JPEG quality: 78%.

## 3. IndexedDB + Cloud Sync

**All local persistence:** `src/lib/storage.ts` — `saveGrave`, `getGrave`, `getAllGraves`, etc.

**Cloud sync:** `src/lib/cloudSync.ts` — fire-and-forget; never block the UI on it.

**Critical pattern — always re-read before cloud writes:**
```ts
const fresh = await getGrave(record.id);
await saveGrave({ ...(fresh ?? record), syncedAt: Date.now() });
```
This prevents the cloud write from clobbering research data that a concurrent lookup fetch may have written while the photo upload was in flight.

**Offline queue:** `src/lib/queue.ts` — items are `QueuedCapture` objects in IndexedDB. Processed when connectivity returns. Results save directly to the graves archive (no ResultPage flow).

## 4. Multi-Person Stones

**Type:** `ExtractedGraveData.people?: PersonData[]` — one entry per person on the stone.

**ResultPage state (src/components/results/ResultPage.tsx):**
- `selectedPersonIdx` — current pill index (0 = primary)
- `selectedPersonData: ExtractedGraveData | null` — merged data for the selected person; null = primary (use `pending.extracted`). Set in `handleSelectPerson`.
- `personResearchCacheRef` — in-memory `Map<number, ResearchData>`; NOT persisted to IDB. Secondary-person research is ephemeral.

**Cultural context callbacks** (`handleLoadCultural`, `handleExpandCategory`) read from `selectedPersonData ?? pending.extracted`. Adding a new cultural API call must follow this pattern or it will always query person 0's data.

**`personFetchAbortRef`** — `AbortController` ref that cancels the previous in-flight `/api/lookup` fetch when the user rapidly taps person pills.

## 5. Auth Pattern

Every API route (except `/api/version`) must have this as the first two lines of `POST`:
```ts
const auth = await requireAuth();
if (auth instanceof NextResponse) return auth;
```

`requireAuth()` is in `src/lib/apiAuth.ts`. It reads the Supabase session from request cookies via `createClient()` in `src/lib/supabase/server.ts`.

`/api/version` is intentionally public — it returns a build timestamp for PWA update detection, no API cost.

## 6. Working Scans Flow

`GraveRecord.needsReview?: boolean` — set when user defers name entry.

**`reviewPrompt` useEffect** in ResultPage deps: `[pending, researchLoading]`. This fires for:
- Fresh scans: `researchLoading` flips `true → false` after lookup completes
- Archived `needsReview` records: `pending` populates (researchLoading never flips for archived path)

**Clears `needsReview`** in `handleExtractedEdit` when `!!next.name && existing.needsReview`.

**ArchivePage:** `workingScans` and `filteredGraves` are separate memos — `needsReview` records appear only in the Working Scans section, excluded from the main list.

## 7. CSS / Theming

The design system uses CSS variables that **invert between dark and light mode**:
- `--t-stone-100` through `--t-stone-900` (stone scale, inverts)
- `--t-gold-200` through `--t-gold-600`

**Never use hardcoded hex for text or background colors** — they bypass light-mode inversion. Always use:
- Tailwind classes (`text-stone-400`, `bg-stone-900`)
- CSS variables via inline style (`color: "var(--t-gold-500)"`)

Exception: fully opaque decorative colors where light-mode adaptation is not needed.

## 8. Key File Map

| Concern | File |
|---|---|
| Vision API | `src/app/api/analyze/route.ts` |
| Research lookup | `src/app/api/lookup/route.ts` |
| Story generation | `src/app/api/story/route.ts` |
| Cultural context | `src/app/api/cultural/route.ts` |
| TTS | `src/app/api/tts/route.ts` |
| Auth guard | `src/lib/apiAuth.ts` |
| Supabase clients | `src/lib/supabase/server.ts`, `browser.ts` |
| All DB ops | `src/lib/storage.ts` |
| Cloud sync | `src/lib/cloudSync.ts` |
| Image processing | `src/lib/relief.ts` |
| TTS voice selection | `src/lib/ttsUtils.ts` (`inferGender`, `inferOrigin`, `selectVoice`) |
| Types | `src/types/index.ts` |
| Main result view | `src/components/results/ResultPage.tsx` |
| Capture + preprocessing | `src/components/capture/CapturePage.tsx` |
| Archive + Working Scans | `src/components/archive/ArchivePage.tsx` |
| Offline queue processor | `src/lib/queue.ts` |
