-- Run this in Supabase Dashboard → SQL Editor after creating a project.
-- Enables email magic-link users to store MCU watchlist progress in Postgres.
--
-- Guest / no-login browsing in the app does NOT use this table; it keeps progress in
-- the browser session only (sessionStorage). Rows here are keyed by auth.users.id.

create table if not exists public.watchlist_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.watchlist_progress enable row level security;

create policy "watchlist_progress_select_own"
  on public.watchlist_progress
  for select
  using (auth.uid() = user_id);

create policy "watchlist_progress_insert_own"
  on public.watchlist_progress
  for insert
  with check (auth.uid() = user_id);

create policy "watchlist_progress_update_own"
  on public.watchlist_progress
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
