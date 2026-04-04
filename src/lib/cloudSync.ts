/**
 * Cloud sync utilities for GraveLens.
 *
 * All functions require a Supabase browser client and a user ID. They are
 * intentionally fire-and-forget — every caller should treat cloud failures
 * as non-fatal, since IndexedDB is the source of truth for offline use.
 *
 * Photo storage layout in the "grave-photos" bucket:
 *   {userId}/{graveId}.jpg
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GraveRecord } from "@/types";
import { getAllGraves, saveGrave } from "@/lib/storage";
import {
  loadUnlocks,
  loadStats,
  updateStats,
  type UnlockRecord,
  type AppStats,
} from "@/lib/achievements";

const BUCKET = "grave-photos";
const SYNC_KEY = "gl_synced_at";

// ── Photo upload ──────────────────────────────────────────────────────────────

/**
 * Upload a base64 data URL to Supabase Storage and return the public CDN URL.
 * If the value is already an https:// URL the upload is skipped (idempotent).
 */
export async function uploadPhoto(
  supabase: SupabaseClient,
  userId: string,
  graveId: string,
  dataUrl: string
): Promise<string> {
  if (dataUrl.startsWith("https://")) return dataUrl;

  // Strip the "data:image/jpeg;base64," prefix
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Invalid data URL");

  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "image/jpeg" });

  const path = `${userId}/${graveId}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/jpeg" });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ── Grave upsert ──────────────────────────────────────────────────────────────

/**
 * Write or update a single grave record in the cloud database.
 * The photoUrl should be the CDN URL returned by uploadPhoto.
 */
export async function upsertGrave(
  supabase: SupabaseClient,
  userId: string,
  record: GraveRecord,
  photoUrl: string
): Promise<void> {
  const { error } = await supabase.from("graves").upsert({
    id: record.id,
    user_id: userId,
    timestamp: record.timestamp,
    photo_url: photoUrl,
    location: record.location ?? {},
    extracted: record.extracted ?? {},
    research: record.research ?? {},
    tags: record.tags ?? [],
    user_notes: record.userNotes ?? null,
    is_public: record.isPublic ?? false,
    community_note: record.communityNote ?? null,
    synced_at: new Date().toISOString(),
  });

  if (error) throw error;
}

// ── Cloud delete ──────────────────────────────────────────────────────────────

/**
 * Remove a grave record and its photo from the cloud.
 * Non-fatal — local delete always proceeds regardless.
 */
export async function deleteFromCloud(
  supabase: SupabaseClient,
  userId: string,
  graveId: string
): Promise<void> {
  await supabase.from("graves").delete().eq("id", graveId);
  await supabase.storage.from(BUCKET).remove([`${userId}/${graveId}.jpg`]);
}

// ── Fetch all from cloud ──────────────────────────────────────────────────────

/**
 * Fetch all grave records for the current user from Supabase.
 * Maps the DB row shape back to GraveRecord.
 */
export async function fetchAllFromCloud(
  supabase: SupabaseClient,
  userId: string
): Promise<GraveRecord[]> {
  const { data, error } = await supabase
    .from("graves")
    .select("*")
    .eq("user_id", userId)
    .order("timestamp", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    timestamp: row.timestamp,
    photoDataUrl: row.photo_url,
    location: row.location ?? {},
    extracted: row.extracted ?? {},
    research: row.research ?? {},
    tags: row.tags ?? [],
    userNotes: row.user_notes ?? undefined,
    syncedAt: new Date(row.synced_at).getTime(),
  })) as GraveRecord[];
}

// ── Bulk migration ────────────────────────────────────────────────────────────

/**
 * One-time migration: push all local IndexedDB records to Supabase.
 * Already-synced records (by id) are skipped.
 * Runs at most 3 uploads concurrently to avoid rate-limiting.
 */
export async function syncLocalToCloud(
  supabase: SupabaseClient,
  userId: string
): Promise<{ synced: number; failed: number }> {
  const local = await getAllGraves();
  if (local.length === 0) return { synced: 0, failed: 0 };

  // Get IDs already in the cloud so we don't re-upload
  const { data: existing } = await supabase
    .from("graves")
    .select("id")
    .in(
      "id",
      local.map((r) => r.id)
    );
  const syncedIds = new Set((existing ?? []).map((r: { id: string }) => r.id));
  const pending = local.filter((r) => !syncedIds.has(r.id));

  let synced = 0;
  let failed = 0;

  // Process in batches of 3
  const CONCURRENCY = 3;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (record) => {
        try {
          const photoUrl = await uploadPhoto(
            supabase,
            userId,
            record.id,
            record.photoDataUrl
          );
          await upsertGrave(supabase, userId, record, photoUrl);

          // Update local copy with the CDN URL so images load from cloud
          await saveGrave({ ...record, photoDataUrl: photoUrl, syncedAt: Date.now() });
          synced++;
        } catch (err) {
          console.warn(`[Sync] Failed to sync grave ${record.id}:`, err);
          failed++;
        }
      })
    );
  }

  if (synced > 0) {
    try {
      localStorage.setItem(SYNC_KEY, new Date().toISOString());
    } catch { /* ignore */ }
  }

  return { synced, failed };
}

export function hasEverSynced(): boolean {
  try {
    return !!localStorage.getItem(SYNC_KEY);
  } catch {
    return false;
  }
}

// ── Explorer points (achievements + stats) sync ───────────────────────────────

/**
 * Push local achievement unlocks and app stats to the cloud, merging with any
 * existing cloud data so progress is never lost on either device.
 *
 * Merge rules:
 *   unlocks  — union by id; keep earliest unlockedAt timestamp
 *   stats    — take max of sharesCount / cemeteryNamesAdded; union daysActive
 */
export async function pushExplorerPoints(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const localUnlocks = loadUnlocks();
  const localStats = loadStats();

  // Fetch existing cloud row (may not exist yet)
  const { data: existing } = await supabase
    .from("user_profiles")
    .select("achievement_unlocks, app_stats")
    .eq("user_id", userId)
    .maybeSingle();

  const cloudUnlocks: UnlockRecord[] = existing?.achievement_unlocks ?? [];
  const cloudStats: AppStats = existing?.app_stats ?? {
    sharesCount: 0,
    cemeteryNamesAdded: 0,
    daysActive: [],
  };

  // Merge unlocks — union, keeping earliest timestamp per id
  const mergedUnlocksMap = new Map<string, UnlockRecord>();
  for (const u of [...cloudUnlocks, ...localUnlocks]) {
    const existing = mergedUnlocksMap.get(u.id);
    if (!existing || u.unlockedAt < existing.unlockedAt) {
      mergedUnlocksMap.set(u.id, u);
    }
  }
  const mergedUnlocks = Array.from(mergedUnlocksMap.values());

  // Merge stats
  const mergedStats: AppStats = {
    sharesCount: Math.max(localStats.sharesCount, cloudStats.sharesCount),
    cemeteryNamesAdded: Math.max(
      localStats.cemeteryNamesAdded,
      cloudStats.cemeteryNamesAdded
    ),
    daysActive: Array.from(
      new Set([...localStats.daysActive, ...cloudStats.daysActive])
    ).sort(),
  };

  const { error } = await supabase.from("user_profiles").upsert({
    user_id: userId,
    achievement_unlocks: mergedUnlocks,
    app_stats: mergedStats,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

/**
 * Pull achievement unlocks and stats from the cloud and merge into local
 * storage, so a new device immediately inherits all Explorer progress.
 *
 * Uses the same merge rules as pushExplorerPoints so the operation is safe
 * to call concurrently on multiple devices.
 */
export async function pullExplorerPoints(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("achievement_unlocks, app_stats")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return;

  const cloudUnlocks: UnlockRecord[] = data.achievement_unlocks ?? [];
  const cloudStats: AppStats = data.app_stats ?? {
    sharesCount: 0,
    cemeteryNamesAdded: 0,
    daysActive: [],
  };

  // Merge with what's already local
  const localUnlocks = loadUnlocks();
  const localStats = loadStats();

  const mergedUnlocksMap = new Map<string, UnlockRecord>();
  for (const u of [...localUnlocks, ...cloudUnlocks]) {
    const existing = mergedUnlocksMap.get(u.id);
    if (!existing || u.unlockedAt < existing.unlockedAt) {
      mergedUnlocksMap.set(u.id, u);
    }
  }

  const mergedStats: AppStats = {
    sharesCount: Math.max(localStats.sharesCount, cloudStats.sharesCount),
    cemeteryNamesAdded: Math.max(
      localStats.cemeteryNamesAdded,
      cloudStats.cemeteryNamesAdded
    ),
    daysActive: Array.from(
      new Set([...localStats.daysActive, ...cloudStats.daysActive])
    ).sort(),
  };

  // Write merged data back to localStorage
  try {
    localStorage.setItem(
      "gl_achievement_unlocks",
      JSON.stringify(Array.from(mergedUnlocksMap.values()))
    );
    updateStats(mergedStats);
  } catch { /* ignore */ }
}
