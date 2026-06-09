-- Phase 2: shared watch-party sessions (collaboration).
-- Progress is keyed by session_id + item_id with last-write-wins per item.

create table if not exists public.collab_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'MCU Watch Party',
  join_code text not null unique,
  created_by uuid references public.custom_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collab_members (
  session_id uuid not null references public.collab_sessions (id) on delete cascade,
  user_id uuid not null references public.custom_users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.collab_item_progress (
  session_id uuid not null references public.collab_sessions (id) on delete cascade,
  item_id text not null,
  status text not null check (status in ('not_started', 'watching', 'completed')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.custom_users (id) on delete set null,
  primary key (session_id, item_id)
);

create index if not exists collab_sessions_join_code_idx on public.collab_sessions (join_code);
create index if not exists collab_members_user_id_idx on public.collab_members (user_id);
create index if not exists collab_item_progress_session_id_idx on public.collab_item_progress (session_id);
