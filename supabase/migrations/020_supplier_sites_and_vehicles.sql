-- Migration 020: supplier warehouses, productions, vehicles (SRC-703).
-- Spec: ai_docs/develop/features/F012-supplier-organization.md,
--        ai_docs/develop/plans/2026-06-04-phase7-7-supplier-organization.md (SRC-703).
-- Depends on: 018_supplier_org_enums.sql (vehicle enums),
--             019_supplier_members.sql (suppliers org context).
--
-- RLS enabled on all three tables; policies deferred to SRC-705.

-- 1. supplier_warehouses — operational sites (F012 §91).
create table if not exists public.supplier_warehouses (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  name text not null,
  address text,
  region text,
  latitude numeric,
  longitude numeric,
  contact_name text,
  phone text,
  working_hours text,
  loading_conditions text,
  comment text,
  pickup_available boolean not null default false,
  delivery_available boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_supplier_warehouses_supplier_id
  on public.supplier_warehouses (supplier_id);

create index if not exists idx_supplier_warehouses_supplier_active
  on public.supplier_warehouses (supplier_id)
  where is_active;

-- 2. supplier_productions — same field set as warehouses minus pickup/delivery (F012 §91).
create table if not exists public.supplier_productions (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  name text not null,
  address text,
  region text,
  latitude numeric,
  longitude numeric,
  contact_name text,
  phone text,
  working_hours text,
  loading_conditions text,
  comment text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_supplier_productions_supplier_id
  on public.supplier_productions (supplier_id);

create index if not exists idx_supplier_productions_supplier_active
  on public.supplier_productions (supplier_id)
  where is_active;

-- 3. supplier_vehicles — fleet (F012 §93; enums from migration 018).
create table if not exists public.supplier_vehicles (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  title text not null,
  vehicle_type public.supplier_vehicle_type not null,
  payload_tons numeric,
  volume_m3 numeric,
  body_length_m numeric,
  region text,
  price_model public.supplier_price_model,
  base_price numeric,
  availability_status public.supplier_availability_status not null default 'unknown',
  comment text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_supplier_vehicles_supplier_id
  on public.supplier_vehicles (supplier_id);

create index if not exists idx_supplier_vehicles_supplier_active
  on public.supplier_vehicles (supplier_id)
  where is_active;

-- 4. updated_at triggers (reuses public.set_updated_at from migration 004).
drop trigger if exists set_supplier_warehouses_updated_at on public.supplier_warehouses;
create trigger set_supplier_warehouses_updated_at
  before update on public.supplier_warehouses
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_supplier_productions_updated_at on public.supplier_productions;
create trigger set_supplier_productions_updated_at
  before update on public.supplier_productions
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_supplier_vehicles_updated_at on public.supplier_vehicles;
create trigger set_supplier_vehicles_updated_at
  before update on public.supplier_vehicles
  for each row
  execute function public.set_updated_at();

-- 5. RLS enabled; policies in SRC-705.
alter table public.supplier_warehouses enable row level security;
alter table public.supplier_productions enable row level security;
alter table public.supplier_vehicles enable row level security;
