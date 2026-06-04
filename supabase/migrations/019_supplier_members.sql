-- Migration 019: supplier_members + profiles.supplier_id sync (SRC-702).
-- Spec: ai_docs/develop/features/F012-supplier-organization.md,
--        ai_docs/develop/plans/2026-06-04-phase7-7-supplier-organization.md (SRC-702).
-- Depends on: 018_supplier_org_enums.sql (supplier_member_role enum).
--
-- MVP: one row per user (UNIQUE user_id). RLS policies deferred to SRC-705.
-- profiles.supplier_id stays the runtime cache for current_user_supplier_id();
-- sync is enforced by trigger below (server actions may also write membership
-- and rely on the same trigger — no duplicate sync logic required in app code).

-- 1. supplier_members — org membership (F012 §79–89).
create table if not exists public.supplier_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  member_role public.supplier_member_role not null default 'supplier_admin',
  is_active boolean not null default true,
  notification_channels text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_members_user_id_key unique (user_id)
);

create index if not exists idx_supplier_members_supplier_id
  on public.supplier_members (supplier_id);

create index if not exists idx_supplier_members_supplier_active
  on public.supplier_members (supplier_id)
  where is_active;

-- 2. updated_at (reuses public.set_updated_at from migration 004).
drop trigger if exists set_supplier_members_updated_at on public.supplier_members;
create trigger set_supplier_members_updated_at
  before update on public.supplier_members
  for each row
  execute function public.set_updated_at();

-- 3. Backfill: legacy 1:1 supplier users → first supplier_admin membership.
insert into public.supplier_members (user_id, supplier_id, member_role, is_active)
select p.id, p.supplier_id, 'supplier_admin'::public.supplier_member_role, true
from public.profiles p
where p.role = 'supplier'
  and p.supplier_id is not null
on conflict (user_id) do nothing;

-- 4. Keep profiles.supplier_id aligned with active membership (F012 §41–43).
-- SECURITY DEFINER so updates succeed regardless of caller RLS on profiles.
create or replace function public.sync_profile_supplier_id_from_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (
      select 1
      from public.supplier_members sm
      where sm.user_id = old.user_id
        and sm.is_active
    ) then
      update public.profiles
      set supplier_id = null
      where id = old.user_id
        and supplier_id is not null;
    end if;
    return old;
  end if;

  if new.is_active then
    update public.profiles
    set supplier_id = new.supplier_id
    where id = new.user_id
      and supplier_id is distinct from new.supplier_id;
  elsif not exists (
    select 1
    from public.supplier_members sm
    where sm.user_id = new.user_id
      and sm.is_active
      and sm.id is distinct from new.id
  ) then
    update public.profiles
    set supplier_id = null
    where id = new.user_id
      and supplier_id is not null;
  end if;

  return new;
end;
$$;

drop trigger if exists supplier_members_sync_profile_supplier_id on public.supplier_members;
create trigger supplier_members_sync_profile_supplier_id
  after insert or update of supplier_id, is_active, user_id
  or delete
  on public.supplier_members
  for each row
  execute function public.sync_profile_supplier_id_from_membership();

-- 5. Reconcile any drift after backfill (idempotent).
update public.profiles p
set supplier_id = sm.supplier_id
from public.supplier_members sm
where sm.user_id = p.id
  and sm.is_active
  and p.supplier_id is distinct from sm.supplier_id;

update public.profiles p
set supplier_id = null
where p.supplier_id is not null
  and not exists (
    select 1
    from public.supplier_members sm
    where sm.user_id = p.id
      and sm.is_active
  );

-- 6. RLS enabled; policies in SRC-705.
alter table public.supplier_members enable row level security;
