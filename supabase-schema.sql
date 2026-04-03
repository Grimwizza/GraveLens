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

-- Community read: authenticated users can read any profile
-- (sensitive columns like show_username are filtered in app layer)
create policy "Community can read profiles"
  on public.user_profiles for select
  to authenticated
  using (true);


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

create policy "Authenticated users write history cache"
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

create policy "Authenticated users write cemetery cache"
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


-- ── Grave identity index (deduplication) ─────────────────────
-- Allows detecting when two users scan the same grave.
-- Hash key: SHA-1 of (normalized lastName + deathYear + cemetery_osm_id).

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

create policy "Authenticated users write grave index"
  on public.grave_identity_index for insert
  to authenticated with check (true);

create policy "Authenticated users update grave index"
  on public.grave_identity_index for update
  to authenticated using (true);


-- ── RPC: increment grave contributor count ───────────────────
-- Called when a second user scans the same grave.

create or replace function public.increment_grave_contributor(hash text)
returns void
language sql
security definer
as $$
  update public.grave_identity_index
  set contributor_count = contributor_count + 1,
      confirmed_at      = now()
  where identity_hash = hash;
$$;
