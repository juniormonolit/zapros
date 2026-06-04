-- Migration 018: supplier organization enums + suppliers org columns (SRC-701).
-- Spec: ai_docs/develop/features/F012-supplier-organization.md,
--        ai_docs/develop/plans/2026-06-04-phase7-7-supplier-organization.md (SRC-701).
--
-- Creates enums for membership, org kind/priority, and fleet (vehicles table in SRC-703).
-- Extends public.suppliers with org fields; does NOT add supplier_members (SRC-702).
--
-- Idempotent: enums guarded via pg_type/pg_enum; columns use ADD COLUMN IF NOT EXISTS.

-- 1. supplier_member_role — org roles (not user_role); used by supplier_members in SRC-702.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'supplier_member_role') then
    create type public.supplier_member_role as enum ('supplier_admin', 'supplier_user');
  end if;
end $$;

-- 2. supplier_kind — manufacturer / dealer / carrier / mixed (F012 §8).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'supplier_kind') then
    create type public.supplier_kind as enum ('manufacturer', 'dealer', 'carrier', 'mixed');
  end if;
end $$;

-- 3. supplier_wave_priority — wave sourcing priority (F012 §7).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'supplier_wave_priority') then
    create type public.supplier_wave_priority as enum (
      'favorite', 'verified', 'normal', 'reserve', 'stop_list'
    );
  end if;
end $$;

-- 4. supplier_vehicle_type — fleet vehicle types (F012 §5.3; table in SRC-703).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'supplier_vehicle_type') then
    create type public.supplier_vehicle_type as enum (
      'manipulator', 'truck', 'semitrailer', 'dump_truck', 'tonar', 'gazelle', 'other'
    );
  end if;
end $$;

-- 5. supplier_price_model — fleet pricing (F012 §5.3).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'supplier_price_model') then
    create type public.supplier_price_model as enum ('fixed', 'per_km', 'per_hour', 'negotiable');
  end if;
end $$;

-- 6. supplier_availability_status — fleet availability (F012 §5.3).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'supplier_availability_status') then
    create type public.supplier_availability_status as enum ('available', 'busy', 'unknown');
  end if;
end $$;

-- 7. Extend suppliers — org profile, notifications, terms (F012 §6–9, §11).
alter table public.suppliers
  add column if not exists supplier_kind public.supplier_kind;
alter table public.suppliers
  add column if not exists wave_priority public.supplier_wave_priority not null default 'normal';
alter table public.suppliers
  add column if not exists regions text[] not null default '{}';
alter table public.suppliers
  add column if not exists share_team_responses boolean not null default false;
alter table public.suppliers
  add column if not exists notification_channels text[] not null default '{}';
alter table public.suppliers
  add column if not exists works_with_vat boolean;
alter table public.suppliers
  add column if not exists payment_deferral_days integer;
alter table public.suppliers
  add column if not exists min_order_amount numeric;
alter table public.suppliers
  add column if not exists delivery_available boolean;
alter table public.suppliers
  add column if not exists pickup_available boolean;
alter table public.suppliers
  add column if not exists terms_comment text;

-- 8. Filter indexes for org list (kind, priority, regions) among active suppliers.
create index if not exists suppliers_org_kind_priority_idx
  on public.suppliers (supplier_kind, wave_priority)
  where is_active;

create index if not exists suppliers_org_regions_gin_idx
  on public.suppliers using gin (regions)
  where is_active;
