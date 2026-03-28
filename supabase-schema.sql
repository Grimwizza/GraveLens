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
