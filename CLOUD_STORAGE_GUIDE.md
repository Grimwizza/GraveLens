# Cloud Storage Migration Guide

This guide covers upgrading GraveLens from local IndexedDB photo storage to
cloud-backed storage using **Supabase Storage** (recommended) or
**Cloudflare R2**. Read this before starting — the migration touches three
specific files and requires no schema changes to your existing data model.

---

## Current architecture (local-only)

```
Camera / Library
      │
      ▼
resizeForStorage()          ← canvas resize to ≤1200px / 80% JPEG
      │
      ▼
savePendingResult()         ← stores full data:image/jpeg;base64,… in IndexedDB
      │
      ▼
saveGrave()                 ← GraveRecord.photoDataUrl = the base64 string
```

Every `GraveRecord.photoDataUrl` is a self-contained base64 data URL living
entirely on the user's device. No server ever touches the image after analysis.

**Limits of this approach:**
- ~100–250 KB per photo after compression (improved from 3–8 MB raw)
- iOS Safari can evict IndexedDB silently when storage is pressured
- No sync across the user's own devices
- No recovery if the user clears browser data

---

## Recommended: Supabase Storage

Supabase Storage is S3-compatible, has a generous free tier (1 GB storage,
2 GB egress/month), and integrates cleanly with Next.js. Images are served
from a CDN. You can add auth-scoped buckets later if you add user accounts.

### Why not Cloudflare R2?

R2 has zero egress fees (better at scale) but requires more wiring for
presigned uploads from a browser. Start with Supabase — migrate to R2 if
you hit cost/scale limits.

---

## Step-by-step migration

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project
2. In **Storage → Buckets**, create a bucket named `grave-photos`
3. Set the bucket to **Public** (photos are not sensitive; this avoids
   signed URL expiry issues in the archive)
4. Note your project URL and `anon` key from **Settings → API**

### 2. Install the Supabase client

```bash
npm install @supabase/supabase-js
```

### 3. Add environment variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Create `src/lib/cloudStorage.ts`

```ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BUCKET = "grave-photos";

/**
 * Upload a compressed data URL to Supabase Storage.
 * Returns the public URL of the stored image.
 * Throws on upload failure — caller should fall back to storing the
 * data URL locally if this fails.
 */
export async function uploadPhoto(
  id: string,
  dataUrl: string
): Promise<string> {
  // Convert data URL to Blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();

  const path = `${id}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Delete a photo from cloud storage by grave ID.
 * Call this from deleteGrave() so storage doesn't accumulate orphans.
 */
export async function deletePhoto(id: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([`${id}.jpg`]);
}

/**
 * Returns true if a string is a cloud URL (not a local data URL).
 * Useful for guarding upload logic during the migration period.
 */
export function isCloudUrl(url: string): boolean {
  return url.startsWith("https://");
}
```

### 5. Update `CapturePage.tsx`

Replace the storage step in `handleAnalyze`. The only change is swapping
the stored `photoDataUrl` from a local data URL to a cloud URL:

```ts
// Before (local only):
const storageDataUrl = await resizeForStorage(previewUrl);
const pendingResult = { id, photoDataUrl: storageDataUrl, ... };

// After (cloud):
import { uploadPhoto } from "@/lib/cloudStorage";

const storageDataUrl = await resizeForStorage(previewUrl);

let photoDataUrl = storageDataUrl; // fallback to local if upload fails
try {
  photoDataUrl = await uploadPhoto(id, storageDataUrl);
} catch (err) {
  console.warn("Cloud upload failed, falling back to local storage:", err);
}

const pendingResult = { id, photoDataUrl, ... };
```

`resizeForStorage()` stays exactly as-is — you still compress before uploading.
The cloud gets the same ~100–250 KB file, not the raw original.

### 6. Update `src/lib/storage.ts` — wire up photo deletion

```ts
import { deletePhoto, isCloudUrl } from "@/lib/cloudStorage";

export async function deleteGrave(id: string): Promise<void> {
  const db = await getDB();
  const record = await db.get(STORE_NAME, id);

  // Delete cloud photo if it was uploaded
  if (record?.photoDataUrl && isCloudUrl(record.photoDataUrl)) {
    await deletePhoto(id).catch(() => {}); // non-fatal
  }

  await db.delete(STORE_NAME, id);
}
```

### 7. Handle existing local records (migration)

Existing archives store base64 data URLs. New records will store cloud URLs.
Both formats work transparently — `<img src={photoDataUrl}>` renders either.

When you're ready, add a one-time migration function:

```ts
// src/lib/migratePhotos.ts
import { getAllGraves, saveGrave } from "@/lib/storage";
import { uploadPhoto, isCloudUrl } from "@/lib/cloudStorage";

export async function migrateLocalPhotosToCloud(): Promise<void> {
  const graves = await getAllGraves();
  const local = graves.filter((g) => !isCloudUrl(g.photoDataUrl));

  for (const grave of local) {
    try {
      const cloudUrl = await uploadPhoto(grave.id, grave.photoDataUrl);
      await saveGrave({ ...grave, photoDataUrl: cloudUrl });
      console.log(`Migrated ${grave.id}`);
    } catch (err) {
      console.warn(`Failed to migrate ${grave.id}:`, err);
    }
    // Supabase free tier: no strict rate limit, but be polite
    await new Promise((r) => setTimeout(r, 200));
  }
}
```

Call `migrateLocalPhotosToCloud()` once from a settings page or admin route.
It's safe to run multiple times (uses `upsert: true`).

---

## Storage cost estimate (Supabase free tier)

| Markers | Storage used | Monthly egress (active user) |
|---------|-------------|------------------------------|
| 50      | ~10 MB      | ~50 MB                       |
| 250     | ~50 MB      | ~250 MB                      |
| 1,000   | ~200 MB     | ~1 GB                        |

Supabase free tier: **1 GB storage, 2 GB egress/month**.
A single user hitting Level 10 (Master Historian, ~250 markers) uses ~50 MB
storage and stays well within the free tier indefinitely.

Pro tier ($25/month) covers 100 GB storage — enough for thousands of users.

---

## Files changed in total

| File | Change |
|------|--------|
| `src/components/capture/CapturePage.tsx` | Add `uploadPhoto()` call after `resizeForStorage()` |
| `src/lib/storage.ts` | Add `deletePhoto()` call in `deleteGrave()` |
| `src/lib/cloudStorage.ts` | New file — Supabase client + upload/delete helpers |
| `src/lib/migratePhotos.ts` | New file — one-time migration for existing records |
| `.env.local` | Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

No changes to `GraveRecord` type, IndexedDB schema, or any UI components.
The `photoDataUrl` field accepts both `data:` URLs and `https://` URLs.
