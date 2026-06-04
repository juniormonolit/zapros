-- Migration 021: product categories/brands + supplier junctions (SRC-704).
-- Spec: ai_docs/develop/features/F012-supplier-organization.md,
--        ai_docs/develop/plans/2026-06-04-phase7-7-supplier-organization.md (SRC-704).
-- Depends on: 002_suppliers_groups.sql (suppliers),
--             020_supplier_sites_and_vehicles.sql (org context).
--
-- MVP: supplier-level junction only; site-level junction tables deferred.
-- RLS enabled on all tables; policies deferred to SRC-705.

-- 1. product_categories — reference catalog (F012 §95–99).
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  constraint product_categories_key_key unique (key)
);

create index if not exists idx_product_categories_sort_active
  on public.product_categories (sort_order)
  where is_active;

-- 2. product_brands — reference catalog (F012 §95–99).
create table if not exists public.product_brands (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  constraint product_brands_key_key unique (key)
);

create index if not exists idx_product_brands_sort_active
  on public.product_brands (sort_order)
  where is_active;

-- 3. supplier_categories — org ↔ category (MVP junction).
create table if not exists public.supplier_categories (
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  category_id uuid not null references public.product_categories (id) on delete cascade,
  primary key (supplier_id, category_id)
);

create index if not exists idx_supplier_categories_category_id
  on public.supplier_categories (category_id);

-- 4. supplier_brands — org ↔ brand (MVP junction).
create table if not exists public.supplier_brands (
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  brand_id uuid not null references public.product_brands (id) on delete cascade,
  primary key (supplier_id, brand_id)
);

create index if not exists idx_supplier_brands_brand_id
  on public.supplier_brands (brand_id);

-- 5. Seed: F012 base category set.
insert into public.product_categories (key, name, sort_order, is_active)
values
  ('insulation', 'Утеплитель', 10, true),
  ('aerated_concrete', 'Газобетон', 20, true),
  ('roofing', 'Кровля', 30, true),
  ('aggregates', 'Нерудные материалы', 40, true),
  ('concrete', 'Бетон', 50, true),
  ('precast_concrete', 'ЖБИ', 60, true),
  ('transport', 'Перевозки', 70, true)
on conflict (key) do nothing;

-- 6. Seed: F012 base brand set.
insert into public.product_brands (key, name, sort_order, is_active)
values
  ('technonicol', 'Технониколь', 10, true),
  ('rockwool', 'Rockwool', 20, true),
  ('isoroc', 'Isoroc', 30, true),
  ('bonolit', 'Bonolit', 40, true),
  ('ytong', 'Ytong', 50, true),
  ('metall_profil', 'Металл Профиль', 60, true),
  ('penoplex', 'Пеноплэкс', 70, true),
  ('knauf', 'Knauf', 80, true),
  ('grand_line', 'Grand Line', 90, true),
  ('lsr', 'ЛСР', 100, true)
on conflict (key) do nothing;

-- 7. RLS enabled; policies in SRC-705.
alter table public.product_categories enable row level security;
alter table public.product_brands enable row level security;
alter table public.supplier_categories enable row level security;
alter table public.supplier_brands enable row level security;
