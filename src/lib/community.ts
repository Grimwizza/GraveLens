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

// ── Shared person research cache + burial index ──────────────────────────────
// Every scan pools the transcribed public facts (burial_index) and every
// completed research run is cached (grave_identity_index) so repeat scans of
// the same person — by any user — cost zero external API calls.

/**
 * Stable per-person key: given|surname|birthYear|deathYear|state (normalized).
 * Returns null when the identity is too ambiguous to pool (no surname, or no
 * date anchor at all).
 */
export function computePersonIdentityKey(p: {
  givenName?: string;
  surname?: string;
  birthYear?: number | null;
  deathYear?: number | null;
  state?: string;
}): string | null {
  const surname = p.surname?.trim().toLowerCase();
  if (!surname) return null;
  if (!p.birthYear && !p.deathYear) return null;
  return [
    (p.givenName ?? "").trim().toLowerCase(),
    surname,
    p.birthYear ?? "",
    p.deathYear ?? "",
    (p.state ?? "").trim().toLowerCase(),
  ].join("|");
}

interface ResearchCacheSnapshot {
  researchVersion: number;
  response: Record<string, unknown>;
}

/**
 * Check the shared research cache for this person. Returns the cached Phase 1
 * lookup response, or null when missing, expired, or from an older pipeline.
 */
export async function checkResearchCache(
  supabase: SupabaseClient,
  identityKey: string,
  currentVersion: number
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from("grave_identity_index")
    .select("research_snapshot, expires_at")
    .eq("identity_hash", identityKey)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null;

  const snap = data.research_snapshot as ResearchCacheSnapshot | null;
  if (!snap || snap.researchVersion !== currentVersion || !snap.response) return null;
  return snap.response;
}

/**
 * Cache a completed research response for this person (365-day TTL,
 * refreshed on re-generation). Non-fatal on failure.
 */
export async function saveResearchCache(
  supabase: SupabaseClient,
  identityKey: string,
  response: Record<string, unknown>,
  currentVersion: number
): Promise<void> {
  const { error } = await supabase.rpc("upsert_grave_identity", {
    hash: identityKey,
    snapshot: { researchVersion: currentVersion, response } satisfies ResearchCacheSnapshot,
  });
  if (error) console.error("[research-cache] save failed:", error.message);
}

export interface BurialIndexEntry {
  identityKey: string;
  givenName?: string;
  surname: string;
  fullName?: string;
  surnameSoundex?: string;
  birthYear?: number | null;
  deathYear?: number | null;
  birthDate?: string;
  deathDate?: string;
  cemetery?: string;
  city?: string;
  county?: string;
  state?: string;
  lat?: number;
  lng?: number;
}

/**
 * Harvest a scan into the pooled burial index. Repeat scans of the same
 * person increment scan_count and back-fill missing facts. Non-fatal.
 */
export async function upsertBurialIndex(
  supabase: SupabaseClient,
  e: BurialIndexEntry
): Promise<void> {
  const { error } = await supabase.rpc("upsert_burial_index", {
    p_identity_key:    e.identityKey,
    p_given_name:      e.givenName ?? null,
    p_surname:         e.surname,
    p_full_name:       e.fullName ?? null,
    p_surname_soundex: e.surnameSoundex ?? null,
    p_birth_year:      e.birthYear ?? null,
    p_death_year:      e.deathYear ?? null,
    p_birth_date:      e.birthDate || null,
    p_death_date:      e.deathDate || null,
    p_cemetery:        e.cemetery || null,
    p_city:            e.city || null,
    p_county:          e.county || null,
    p_state:           e.state || null,
    p_lat:             e.lat ?? null,
    p_lng:             e.lng ?? null,
  });
  if (error) console.error("[burial-index] upsert failed:", error.message);
}
