-- One-shot Supabase setup for MCU Watchlist.
-- Paste this entire file into Supabase Dashboard -> SQL Editor -> Run.
-- Safe to re-run (uses IF NOT EXISTS / DROP POLICY IF EXISTS).

-- =========================================================
-- 001: Watchlist progress for Supabase Auth users (auth.users)
-- Guest browsing in the app does not use this table (sessionStorage only).
-- =========================================================
create table if not exists public.watchlist_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.watchlist_progress enable row level security;

drop policy if exists "watchlist_progress_select_own" on public.watchlist_progress;
create policy "watchlist_progress_select_own"
  on public.watchlist_progress
  for select
  using (auth.uid() = user_id);

drop policy if exists "watchlist_progress_insert_own" on public.watchlist_progress;
create policy "watchlist_progress_insert_own"
  on public.watchlist_progress
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "watchlist_progress_update_own" on public.watchlist_progress;
create policy "watchlist_progress_update_own"
  on public.watchlist_progress
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================================
-- 002: Custom username/passkey + Google auth (used by backend)
-- =========================================================
create table if not exists public.custom_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_salt text,
  password_hash text,
  google_sub text unique,
  email text,
  provider text not null default 'credentials',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_sessions (
  token text primary key,
  user_id uuid not null references public.custom_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.custom_progress (
  user_id uuid primary key references public.custom_users (id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists custom_sessions_user_id_idx on public.custom_sessions (user_id);
create index if not exists custom_users_provider_idx on public.custom_users (provider);
