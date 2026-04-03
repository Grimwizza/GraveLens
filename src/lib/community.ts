/**
 * Community feature utilities for GraveLens.
 *
 * Provides:
 *  - Fetching public graves from friends and the broader community for map display
 *  - User profile upsert / fetch
 *  - Shared AI-result caches (local history, cemetery, military context, grave identity)
 *
 * All functions are non-fatal — callers should treat failures gracefully since
 * community data is supplemental to the user's own local-first archive.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CommunityGraveRecord,
  UserProfile,
  LocalHistoryContext,
  MilitaryContext,
} from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Truncate a coordinate to 1 decimal place for geo-cell keying (~11 km grid). */
function geoCell(lat: number, lng: number): string {
  return `${lat.toFixed(1)}_${lng.toFixed(1)}`;
}

/** Resolve the public display label for a contributor given their profile row. */
function resolveContributorLabel(profile: {
  username?: string | null;
  display_name?: string | null;
  show_username?: boolean | null;
}): string {
  if (profile.show_username && profile.username) return `@${profile.username}`;
  if (profile.display_name) return profile.display_name;
  return "Community Member";
}

// ── User profiles ─────────────────────────────────────────────────────────────

/**
 * Upsert the current user's profile.
 * Called on login and after significant stat changes.
 */
export async function upsertUserProfile(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<{
    username: string;
    displayName: string;
    showUsername: boolean;
    shareAllByDefault: boolean;
    explorerXp: number;
    explorerRank: number;
    graveCount: number;
    publicGraveCount: number;
  }>
): Promise<void> {
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  if (patch.username !== undefined)          row.username              = patch.username;
  if (patch.displayName !== undefined)       row.display_name          = patch.displayName;
  if (patch.showUsername !== undefined)      row.show_username         = patch.showUsername;
  if (patch.shareAllByDefault !== undefined) row.share_all_by_default  = patch.shareAllByDefault;
  if (patch.explorerXp !== undefined)        row.explorer_xp           = patch.explorerXp;
  if (patch.explorerRank !== undefined)      row.explorer_rank         = patch.explorerRank;
  if (patch.graveCount !== undefined)        row.grave_count           = patch.graveCount;
  if (patch.publicGraveCount !== undefined)  row.public_grave_count    = patch.publicGraveCount;

  const { error } = await supabase.from("user_profiles").upsert(row);
  if (error) throw error;
}

/**
 * Fetch the current user's own profile. Returns null if not yet created.
 */
export async function fetchOwnProfile(
  supabase: SupabaseClient,
  userId: string
): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    userId: data.user_id,
    username: data.username ?? undefined,
    displayName: data.display_name ?? undefined,
    showUsername: data.show_username ?? true,
    shareAllByDefault: data.share_all_by_default ?? false,
    explorerXp: data.explorer_xp ?? 0,
    explorerRank: data.explorer_rank ?? 1,
    graveCount: data.grave_count ?? 0,
    publicGraveCount: data.public_grave_count ?? 0,
    joinedAt: data.joined_at,
  };
}

// ── Community graves ──────────────────────────────────────────────────────────

/**
 * Fetch public graves within a lat/lng bounding box, excluding the current
 * user's own graves. Attaches contributor display info from user_profiles.
 *
 * Returns both "friend" and "community" tier records in one call, distinguished
 * by the `tier` field. The caller can split or render them differently.
 *
 * Limit: 200 records per call to keep map performance acceptable.
 */
export async function fetchCommunityGravesInBounds(
  supabase: SupabaseClient,
  userId: string,
  south: number,
  west: number,
  north: number,
  east: number
): Promise<CommunityGraveRecord[]> {
  // 1. Get confirmed friend IDs so we can tag their graves differently
  const { data: friendRows } = await supabase
    .from("user_relationships")
    .select("from_user_id, to_user_id")
    .eq("type", "friend")
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);

  const friendIds = new Set<string>();
  for (const row of friendRows ?? []) {
    const otherId = row.from_user_id === userId ? row.to_user_id : row.from_user_id;
    friendIds.add(otherId);
  }

  // 2. Fetch public graves in bounds (exclude own graves)
  //    Filter by location jsonb lat/lng — cast to float for comparison
  const { data: graveRows, error } = await supabase
    .from("graves")
    .select(`
      id,
      user_id,
      photo_url,
      location,
      extracted,
      community_note,
      user_profiles!inner (
        username,
        display_name,
        show_username,
        explorer_rank
      )
    `)
    .eq("is_public", true)
    .neq("user_id", userId)
    .limit(200);

  if (error || !graveRows) return [];

  const results: CommunityGraveRecord[] = [];

  for (const row of graveRows) {
    const loc = row.location as { lat?: number; lng?: number; cemetery?: string } | null;
    if (!loc?.lat || !loc?.lng) continue;

    // Client-side bounds filter (Supabase doesn't support jsonb range queries without PostGIS)
    if (loc.lat < south || loc.lat > north || loc.lng < west || loc.lng > east) continue;

    const profile = Array.isArray(row.user_profiles)
      ? row.user_profiles[0]
      : row.user_profiles;
    const extracted = row.extracted as {
      name?: string;
      birthDate?: string;
      deathDate?: string;
    } | null;

    results.push({
      id: row.id,
      lat: loc.lat,
      lng: loc.lng,
      name: extracted?.name || "Unknown",
      birthDate: extracted?.birthDate,
      deathDate: extracted?.deathDate,
      cemetery: loc.cemetery,
      photoUrl: row.photo_url,
      communityNote: row.community_note ?? undefined,
      tier: friendIds.has(row.user_id) ? "friend" : "community",
      contributorLabel: profile ? resolveContributorLabel(profile) : "Community Member",
      contributorRank: profile?.explorer_rank ?? 1,
    });
  }

  return results;
}

/**
 * Bulk-set all of the current user's graves to public or private.
 * Used by the "Share all my discoveries" global toggle.
 */
export async function bulkSetGravesPublic(
  supabase: SupabaseClient,
  userId: string,
  isPublic: boolean
): Promise<void> {
  const { error } = await supabase
    .from("graves")
    .update({ is_public: isPublic })
    .eq("user_id", userId);

  if (error) throw error;
}

/**
 * Set a single grave's public flag.
 */
export async function setGravePublic(
  supabase: SupabaseClient,
  graveId: string,
  isPublic: boolean
): Promise<void> {
  const { error } = await supabase
    .from("graves")
    .update({ is_public: isPublic })
    .eq("id", graveId);

  if (error) throw error;
}

// ── Local history cache ───────────────────────────────────────────────────────

export interface LocalHistoryCacheEntry {
  localHistory: LocalHistoryContext;
  wikidataEvents?: unknown;
  nrhpSites?: unknown;
  sources?: unknown;
}

/**
 * Check the shared local history cache for a given lat/lng.
 * Returns null if no fresh entry exists (stale or missing).
 */
export async function checkLocalHistoryCache(
  supabase: SupabaseClient,
  lat: number,
  lng: number
): Promise<LocalHistoryCacheEntry | null> {
  const cell = geoCell(lat, lng);

  const { data, error } = await supabase
    .from("local_history_cache")
    .select("local_history, wikidata_events, nrhp_sites, sources, expires_at")
    .eq("geo_cell", cell)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null; // stale

  return {
    localHistory: data.local_history as LocalHistoryContext,
    wikidataEvents: data.wikidata_events,
    nrhpSites: data.nrhp_sites,
    sources: data.sources,
  };
}

/**
 * Write a local history result to the shared cache.
 * Safe to call fire-and-forget; errors are non-fatal.
 */
export async function saveLocalHistoryCache(
  supabase: SupabaseClient,
  lat: number,
  lng: number,
  entry: LocalHistoryCacheEntry
): Promise<void> {
  const cell = geoCell(lat, lng);

  await supabase.from("local_history_cache").upsert({
    geo_cell: cell,
    local_history: entry.localHistory,
    wikidata_events: entry.wikidataEvents ?? null,
    nrhp_sites: entry.nrhpSites ?? null,
    sources: entry.sources ?? null,
    generated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

// ── Cemetery research cache ───────────────────────────────────────────────────

export interface CemeteryResearchEntry {
  name?: string;
  description?: string;
  wikipediaUrl?: string;
  established?: string;
  denomination?: string;
  notableFeatures?: string[];
  historicalEvents?: string[];
}

/**
 * Check the shared cemetery cache by OSM ID.
 * Returns null if missing or stale.
 */
export async function checkCemeteryCache(
  supabase: SupabaseClient,
  osmId: string
): Promise<CemeteryResearchEntry | null> {
  const { data, error } = await supabase
    .from("cemetery_cache")
    .select("*")
    .eq("osm_id", osmId)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null;

  return {
    name: data.name ?? undefined,
    description: data.description ?? undefined,
    wikipediaUrl: data.wikipedia_url ?? undefined,
    established: data.established ?? undefined,
    denomination: data.denomination ?? undefined,
    notableFeatures: data.notable_features ?? undefined,
    historicalEvents: data.historical_events ?? undefined,
  };
}

/**
 * Write a cemetery research result to the shared cache.
 */
export async function saveCemeteryCache(
  supabase: SupabaseClient,
  osmId: string,
  entry: CemeteryResearchEntry
): Promise<void> {
  await supabase.from("cemetery_cache").upsert({
    osm_id: osmId,
    name: entry.name ?? null,
    description: entry.description ?? null,
    wikipedia_url: entry.wikipediaUrl ?? null,
    established: entry.established ?? null,
    denomination: entry.denomination ?? null,
    notable_features: entry.notableFeatures ?? null,
    historical_events: entry.historicalEvents ?? null,
    generated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  });
}

// ── Military context cache ────────────────────────────────────────────────────

/**
 * Fetch a pre-generated military conflict context by conflict key.
 * e.g. "world_war_i", "civil_war_union", "vietnam_war"
 */
export async function getMilitaryContextCache(
  supabase: SupabaseClient,
  conflictKey: string
): Promise<MilitaryContext | null> {
  const { data, error } = await supabase
    .from("military_context_cache")
    .select("context")
    .eq("conflict_key", conflictKey)
    .maybeSingle();

  if (error || !data) return null;
  return data.context as MilitaryContext;
}

// ── Grave identity index (deduplication) ─────────────────────────────────────

/**
 * Compute an identity hash for deduplication.
 * Uses: normalized lastName + deathYear + cemeteryOsmId (all lowercased, trimmed).
 * Returns null if insufficient data.
 */
export function computeGraveIdentityHash(
  lastName: string,
  deathYear: number | null,
  cemeteryOsmId?: string
): string | null {
  if (!lastName?.trim() || !deathYear) return null;
  const parts = [lastName.trim().toLowerCase(), String(deathYear), (cemeteryOsmId ?? "").toLowerCase()];
  // Simple deterministic key — not cryptographic, just stable for deduplication
  return parts.join("|");
}

export interface GraveIdentityMatch {
  identityHash: string;
  researchSnapshot: unknown;
  contributorCount: number;
}

/**
 * Check if this grave has already been scanned and enriched by another user.
 * Returns the cached research snapshot if found, or null if first scan.
 */
export async function checkGraveIdentityIndex(
  supabase: SupabaseClient,
  identityHash: string
): Promise<GraveIdentityMatch | null> {
  const { data, error } = await supabase
    .from("grave_identity_index")
    .select("identity_hash, research_snapshot, contributor_count, expires_at")
    .eq("identity_hash", identityHash)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null;

  return {
    identityHash: data.identity_hash,
    researchSnapshot: data.research_snapshot,
    contributorCount: data.contributor_count,
  };
}

/**
 * Register a newly scanned grave in the identity index, or increment the
 * contributor count if it was already there.
 */
export async function upsertGraveIdentityIndex(
  supabase: SupabaseClient,
  identityHash: string,
  researchSnapshot: unknown
): Promise<void> {
  // Try insert first
  const { error: insertError } = await supabase
    .from("grave_identity_index")
    .insert({
      identity_hash: identityHash,
      research_snapshot: researchSnapshot,
      contributor_count: 1,
      confirmed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

  if (!insertError) return; // first scan — done

  // Already exists — increment contributor_count
  await supabase.rpc("increment_grave_contributor", { hash: identityHash });
}
