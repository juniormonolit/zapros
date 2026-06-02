-- Migration 002: suppliers, supplier groups, bitrix group settings, app settings
-- Spec: ai_docs/develop/architecture/data-model.md
--        (suppliers, supplier_groups, supplier_group_members,
--         bitrix_group_settings, app_settings)
-- RLS is enabled on every new table; policies are added in FND-006
-- (access stays closed until then).

-- 1. Suppliers
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Supplier groups (UI grouping for checkbox selection)
create table public.supplier_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 3. Supplier <-> group membership (a supplier may belong to several groups)
create table public.supplier_group_members (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id) on delete cascade,
  group_id uuid not null references public.supplier_groups (id) on delete cascade,
  unique (supplier_id, group_id)
);

-- 4. Bitrix group settings (workgroup URL templates with a {task_id} placeholder)
create table public.bitrix_group_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  url_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 5. Global app settings (key-value, edited by admin)
create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- 6. Deferred FK: profiles.supplier_id -> suppliers(id)
-- (the suppliers table did not exist when migration 001 created profiles).
alter table public.profiles
  add constraint profiles_supplier_id_fkey
  foreign key (supplier_id) references public.suppliers (id) on delete set null;

-- 7. Enable RLS on all new tables (policies follow in FND-006).
alter table public.suppliers enable row level security;
alter table public.supplier_groups enable row level security;
alter table public.supplier_group_members enable row level security;
alter table public.bitrix_group_settings enable row level security;
alter table public.app_settings enable row level security;

-- 8. Idempotent seeds.
insert into public.bitrix_group_settings (name, url_template, is_active)
values (
  'мск_Утеплитель',
  'https://td.monolit-crm.ru/workgroups/group/17/tasks/task/view/{task_id}/',
  true
)
on conflict (name) do nothing;

insert into public.app_settings (key, value)
values
  ('response_deadline_days', '10'),
  ('cash_to_noncash_ratio', '0.84')
on conflict (key) do nothing;
