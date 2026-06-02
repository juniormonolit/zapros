-- Migration 001: enums, profiles table, profile-creation trigger, single-admin guard
-- Spec: ai_docs/develop/architecture/data-model.md (profiles),
--        ai_docs/develop/architecture/auth-rls.md (profile creation, single admin)

-- 1. Role enum
create type public.user_role as enum ('admin', 'procurement', 'supplier');

-- 2. Profiles table (extends auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'procurement',
  full_name text,
  -- FK to suppliers is added in migration 002 (table does not exist yet)
  supplier_id uuid,
  is_active boolean not null default true,
  notify_email text,
  notify_on_new_request boolean not null default false,
  notify_on_completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- 3. Auto-create a profile when a new auth user is inserted.
-- SECURITY DEFINER so the trigger can write to public.profiles regardless of the
-- inserting role; search_path is pinned to avoid privilege-escalation via shadowing.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 4. Guarantee at most one admin via a partial unique index.
create unique index one_admin on public.profiles ((role)) where role = 'admin';

-- 5. Enable RLS (policies are added in FND-006; access is closed until then).
alter table public.profiles enable row level security;
