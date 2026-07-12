-- ============================================================
-- GraveLens — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── Graves table ─────────────────────────────────────────────

create table public.graves (
  id            text        primary key,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  timestamp     bigint      not null,
  photo_url     text        not null,
  location      jsonb       not null default '{}',
  extracted     jsonb       not null default '{}',
  research      jsonb       not null default '{}',
  tags          text[]      not null default '{}',
  user_notes    text,
  synced_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index graves_user_timestamp_idx on public.graves (user_id, timestamp desc);
-- Partial index for community map queries (.eq("is_public", true))
create index if not exists graves_is_public_idx on public.graves (is_public, user_id) where is_public = true;

alter table public.graves enable row level security;

create policy "Users can read own graves"
  on public.graves for select
  using (auth.uid() = user_id);

create policy "Users can insert own graves"
  on public.graves for insert
  with check (auth.uid() = user_id);

create policy "Users can update own graves"
  on public.graves for update
  using (auth.uid() = user_id);

create policy "Users can delete own graves"
  on public.graves for delete
  using (auth.uid() = user_id);


-- ── Storage bucket policies ───────────────────────────────────
-- Before running these, create the bucket manually:
--   Supabase Dashboard → Storage → New Bucket
--   Name: grave-photos
--   Public: YES
--   File size limit: 2097152  (2 MB)

create policy "Authenticated users can upload own photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'grave-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Authenticated users can update own photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'grave-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Authenticated users can delete own photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'grave-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Public read access for photos"
  on storage.objects for select
  to public
  using (bucket_id = 'grave-photos');


-- ============================================================
-- Community features — add these via SQL Editor after the above
-- ============================================================

-- ── Community columns on graves ───────────────────────────────

alter table public.graves
  add column if not exists is_public          boolean     not null default false,
  add column if not exists community_note     text;

-- Allow authenticated users to read any public grave
create policy "Community can read public graves"
  on public.graves for select
  using (is_public = true);


-- ── User profiles ─────────────────────────────────────────────
-- Stores display identity, explorer rank, and community preferences.
-- achievement_unlocks and app_stats mirror what cloudSync.ts already writes.

create table if not exists public.user_profiles (
  user_id               uuid        primary key references auth.users(id) on delete cascade,
  username              text        unique,               -- @handle, user-chosen
  display_name          text,                             -- fallback display name
  show_username         boolean     not null default true, -- privacy: show username publicly
  share_all_by_default  boolean     not null default false, -- auto-publish all graves
  explorer_xp           integer     not null default 0,
  explorer_rank         integer     not null default 1,   -- 1–10 derived from xp
  achievement_unlocks   jsonb       not null default '[]',
  app_stats             jsonb       not null default '{}',
  grave_count           integer     not null default 0,
  public_grave_count    integer     not null default 0,
  joined_at             timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

-- Own profile: full CRUD
create policy "Users manage own profile"
  on public.user_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Community read: authenticated users can read profiles that have opted in to
-- community visibility (show_username = true). Users can always read their own.
create policy "Community can read public profiles"
  on public.user_profiles for select
  to authenticated
  using (show_username = true or auth.uid() = user_id);


-- ── User relationships (friends / blocks) ─────────────────────

create table if not exists public.user_relationships (
  id            uuid        primary key default gen_random_uuid(),
  from_user_id  uuid        not null references auth.users(id) on delete cascade,
  to_user_id    uuid        not null references auth.users(id) on delete cascade,
  type          text        not null check (type in ('friend_request', 'friend', 'blocked')),
  created_at    timestamptz not null default now(),
  unique (from_user_id, to_user_id)
);

create index user_relationships_from_idx on public.user_relationships (from_user_id);
create index user_relationships_to_idx   on public.user_relationships (to_user_id);

alter table public.user_relationships enable row level security;

-- Users can see their own relationships
create policy "Users see own relationships"
  on public.user_relationships for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "Users create own relationships"
  on public.user_relationships for insert
  with check (auth.uid() = from_user_id);

create policy "Users update own relationships"
  on public.user_relationships for update
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "Users delete own relationships"
  on public.user_relationships for delete
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);


-- ── Local history cache ───────────────────────────────────────
-- Keyed by a 0.1° geo cell (~11 km grid). Shared across all users.
-- Checked before calling AI for local/regional historical context.

create table if not exists public.local_history_cache (
  geo_cell        text        primary key,  -- "{lat_1dp}_{lng_1dp}" e.g. "42.3_-71.0"
  local_history   jsonb,
  wikidata_events jsonb,
  nrhp_sites      jsonb,
  sources         jsonb,
  generated_at    timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '90 days')
);

alter table public.local_history_cache enable row level security;

create policy "Authenticated users read history cache"
  on public.local_history_cache for select
  to authenticated using (true);

create policy "Authenticated users insert history cache"
  on public.local_history_cache for insert
  to authenticated with check (true);

create policy "Authenticated users update history cache"
  on public.local_history_cache for update
  to authenticated using (true);


-- ── Cemetery research cache ───────────────────────────────────
-- Shared cemetery metadata to avoid re-fetching Wikipedia/OSM data.

create table if not exists public.cemetery_cache (
  osm_id              text        primary key,
  name                text,
  description         text,
  wikipedia_url       text,
  established         text,
  denomination        text,
  notable_features    text[],
  historical_events   text[],
  generated_at        timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '180 days')
);

alter table public.cemetery_cache enable row level security;

create policy "Authenticated users read cemetery cache"
  on public.cemetery_cache for select
  to authenticated using (true);

create policy "Authenticated users insert cemetery cache"
  on public.cemetery_cache for insert
  to authenticated with check (true);

create policy "Authenticated users update cemetery cache"
  on public.cemetery_cache for update
  to authenticated using (true);



-- ── Military context cache ────────────────────────────────────
-- Pre-generated write-ups for each conflict (WWI, WWII, etc.).
-- Populate once; never call AI for these again.

create table if not exists public.military_context_cache (
  conflict_key  text        primary key,  -- e.g. "world_war_i", "civil_war_union"
  context       jsonb       not null,     -- MilitaryContext shape
  updated_at    timestamptz not null default now()
);

alter table public.military_context_cache enable row level security;

create policy "Authenticated users read military cache"
  on public.military_context_cache for select
  to authenticated using (true);


-- ── Grave identity index (shared person research cache) ──────
-- Caches completed research per person so repeat scans — by any
-- user — return instantly with zero external API calls.
-- Key: given|surname|birthYear|deathYear|state (normalized), computed
-- by computePersonIdentityKey() in src/lib/community.ts.
-- Snapshot shape: { researchVersion, response } — entries from older
-- pipeline versions are treated as misses and regenerated.

create table if not exists public.grave_identity_index (
  identity_hash       text        primary key,
  research_snapshot   jsonb       not null,
  contributor_count   integer     not null default 1,
  confirmed_at        timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '365 days')
);

alter table public.grave_identity_index enable row level security;

create policy "Authenticated users read grave index"
  on public.grave_identity_index for select
  to authenticated using (true);


-- ── RPC: increment grave contributor count ───────────────────
-- Called when a second user scans the same grave.

create or replace function public.increment_grave_contributor(hash text)
returns void
language plpgsql
security definer
as $$
begin
  -- Guard: reject unauthenticated callers.
  -- SECURITY DEFINER functions are callable by all roles (including anon)
  -- by default, so an explicit auth check is required here.
  if auth.uid() is null then
    raise exception 'Unauthorized' using errcode = 'insufficient_privilege';
  end if;

  update public.grave_identity_index
  set contributor_count = contributor_count + 1,
      confirmed_at      = now()
  where identity_hash = hash;
end;
$$;


-- ── RPC: upsert grave identity (research cache write) ────────
-- Registers a new research snapshot or refreshes an existing one
-- (snapshot replaced, TTL extended, contributor count incremented).

create or replace function public.upsert_grave_identity(hash text, snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guard: reject unauthenticated callers.
  if auth.uid() is null then
    raise exception 'Unauthorized' using errcode = 'insufficient_privilege';
  end if;

  insert into public.grave_identity_index (identity_hash, research_snapshot, contributor_count, confirmed_at, expires_at)
  values (hash, snapshot, 1, now(), now() + interval '365 days')
  on conflict (identity_hash) do update
  set research_snapshot = excluded.research_snapshot,
      contributor_count = public.grave_identity_index.contributor_count + 1,
      confirmed_at      = now(),
      expires_at        = now() + interval '365 days';
end;
$$;

revoke execute on function public.upsert_grave_identity(text, jsonb) from anon, public;
grant  execute on function public.upsert_grave_identity(text, jsonb) to authenticated;

revoke execute on function public.increment_grave_contributor(text) from anon, public;
grant  execute on function public.increment_grave_contributor(text) to authenticated;
alter function public.increment_grave_contributor(text) set search_path = public;


-- ── Burial index: GraveLens' own person database ─────────────
-- Every scan contributes the transcribed public facts from the stone
-- (no photos, no user notes, no user_id — anonymous pooled facts).
-- Writes go exclusively through upsert_burial_index().

create table if not exists public.burial_index (
  identity_key    text        primary key,   -- given|surname|birthYear|deathYear|state (normalized)
  given_name      text,
  surname         text        not null,
  full_name       text,
  surname_soundex text,
  birth_year      integer,
  death_year      integer,
  birth_date      text,
  death_date      text,
  cemetery        text,
  city            text,
  county          text,
  state           text,
  lat             double precision,
  lng             double precision,
  scan_count      integer     not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists burial_index_surname_death_idx on public.burial_index (surname, death_year);
create index if not exists burial_index_state_death_idx   on public.burial_index (state, death_year);
create index if not exists burial_index_soundex_idx       on public.burial_index (surname_soundex);

alter table public.burial_index enable row level security;

create policy "Authenticated users read burial index"
  on public.burial_index for select
  to authenticated using (true);

create or replace function public.upsert_burial_index(
  p_identity_key    text,
  p_given_name      text,
  p_surname         text,
  p_full_name       text,
  p_surname_soundex text,
  p_birth_year      integer,
  p_death_year      integer,
  p_birth_date      text,
  p_death_date      text,
  p_cemetery        text,
  p_city            text,
  p_county          text,
  p_state           text,
  p_lat             double precision,
  p_lng             double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guard: reject unauthenticated callers.
  if auth.uid() is null then
    raise exception 'Unauthorized' using errcode = 'insufficient_privilege';
  end if;

  if p_identity_key is null or p_surname is null then
    raise exception 'identity_key and surname are required';
  end if;

  insert into public.burial_index (
    identity_key, given_name, surname, full_name, surname_soundex,
    birth_year, death_year, birth_date, death_date,
    cemetery, city, county, state, lat, lng
  ) values (
    p_identity_key, p_given_name, p_surname, p_full_name, p_surname_soundex,
    p_birth_year, p_death_year, p_birth_date, p_death_date,
    p_cemetery, p_city, p_county, p_state, p_lat, p_lng
  )
  on conflict (identity_key) do update
  set scan_count  = public.burial_index.scan_count + 1,
      -- back-fill facts a later scan captured that earlier scans missed
      given_name  = coalesce(public.burial_index.given_name,  excluded.given_name),
      full_name   = coalesce(public.burial_index.full_name,   excluded.full_name),
      birth_year  = coalesce(public.burial_index.birth_year,  excluded.birth_year),
      death_year  = coalesce(public.burial_index.death_year,  excluded.death_year),
      birth_date  = coalesce(public.burial_index.birth_date,  excluded.birth_date),
      death_date  = coalesce(public.burial_index.death_date,  excluded.death_date),
      cemetery    = coalesce(public.burial_index.cemetery,    excluded.cemetery),
      city        = coalesce(public.burial_index.city,        excluded.city),
      county      = coalesce(public.burial_index.county,      excluded.county),
      state       = coalesce(public.burial_index.state,       excluded.state),
      lat         = coalesce(public.burial_index.lat,         excluded.lat),
      lng         = coalesce(public.burial_index.lng,         excluded.lng),
      updated_at  = now();
end;
$$;

revoke execute on function public.upsert_burial_index(text, text, text, text, text, integer, integer, text, text, text, text, text, text, double precision, double precision) from anon, public;
grant  execute on function public.upsert_burial_index(text, text, text, text, text, integer, integer, text, text, text, text, text, text, double precision, double precision) to authenticated;
