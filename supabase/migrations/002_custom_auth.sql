-- Custom username/passkey auth storage for backend APIs.
-- Run after 001_watchlist_progress.sql.

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
