-- Migration 012: supplier_response_versions + response_line_items schema (RSP-001, Phase 4).
-- Spec: ai_docs/develop/architecture/data-model.md (supplier_response_versions,
--        response_line_items, XOR CHECK rules),
--        ai_docs/develop/plans/2026-06-02-phase4-supplier-responses.md (RSP-001).
--
-- Idempotent: tables and indexes use IF NOT EXISTS; named CHECK/UNIQUE constraints
-- are added only when missing (pg_constraint lookup); partial unique index uses
-- IF NOT EXISTS. RLS is enabled (policies — migration 013 / RSP-002).
--
-- Versions are immutable after submit; no updated_at trigger. version_number is
-- set explicitly in submitResponseVersion (RSP-004), not auto-incremented here.

-- 1. supplier_response_versions — versioned supplier answers per invite.
create table if not exists public.supplier_response_versions (
  id uuid primary key default gen_random_uuid(),
  request_supplier_id uuid not null
    references public.request_suppliers (id) on delete cascade,
  version_number int not null,
  is_current boolean not null default false,
  comment text,
  submitted_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id)
);

-- UNIQUE (request_supplier_id, version_number) — guarded for re-runs.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'supplier_response_versions_request_supplier_version_key'
      and conrelid = 'public.supplier_response_versions'::regclass
  ) then
    alter table public.supplier_response_versions
      add constraint supplier_response_versions_request_supplier_version_key
      unique (request_supplier_id, version_number);
  end if;
end $$;

-- 2. response_line_items — one row per request line in a version.
create table if not exists public.response_line_items (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null
    references public.supplier_response_versions (id) on delete cascade,
  request_item_id uuid not null references public.request_items (id),
  price_with_vat numeric,
  price_cash numeric,
  price_without_vat numeric,
  delivery_price numeric,
  price_includes_delivery boolean not null default false,
  in_stock boolean,
  lead_time_days int,
  line_comment text
);

-- UNIQUE (version_id, request_item_id)
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'response_line_items_version_request_item_key'
      and conrelid = 'public.response_line_items'::regclass
  ) then
    alter table public.response_line_items
      add constraint response_line_items_version_request_item_key
      unique (version_id, request_item_id);
  end if;
end $$;

-- Price fields: non-negative when set.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'response_line_items_price_with_vat_nonneg'
      and conrelid = 'public.response_line_items'::regclass
  ) then
    alter table public.response_line_items
      add constraint response_line_items_price_with_vat_nonneg
      check (price_with_vat is null or price_with_vat >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'response_line_items_price_cash_nonneg'
      and conrelid = 'public.response_line_items'::regclass
  ) then
    alter table public.response_line_items
      add constraint response_line_items_price_cash_nonneg
      check (price_cash is null or price_cash >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'response_line_items_price_without_vat_nonneg'
      and conrelid = 'public.response_line_items'::regclass
  ) then
    alter table public.response_line_items
      add constraint response_line_items_price_without_vat_nonneg
      check (price_without_vat is null or price_without_vat >= 0);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'response_line_items_delivery_price_nonneg'
      and conrelid = 'public.response_line_items'::regclass
  ) then
    alter table public.response_line_items
      add constraint response_line_items_delivery_price_nonneg
      check (delivery_price is null or delivery_price >= 0);
  end if;
end $$;

-- lead_time_days > 0 when not null.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'response_line_items_lead_time_days_positive'
      and conrelid = 'public.response_line_items'::regclass
  ) then
    alter table public.response_line_items
      add constraint response_line_items_lead_time_days_positive
      check (lead_time_days is null or lead_time_days > 0);
  end if;
end $$;

-- XOR: in_stock vs lead_time_days (data-model.md).
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'response_line_items_stock_xor_lead_time'
      and conrelid = 'public.response_line_items'::regclass
  ) then
    alter table public.response_line_items
      add constraint response_line_items_stock_xor_lead_time
      check (not (in_stock is not null and lead_time_days is not null));
  end if;
end $$;

-- XOR: delivery_price vs price_includes_delivery (data-model.md).
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'response_line_items_delivery_xor_included'
      and conrelid = 'public.response_line_items'::regclass
  ) then
    alter table public.response_line_items
      add constraint response_line_items_delivery_xor_included
      check (not (delivery_price is not null and price_includes_delivery = true));
  end if;
end $$;

-- 3. Indexes — supplier_response_versions.
create index if not exists idx_supplier_response_versions_request_supplier_id
  on public.supplier_response_versions (request_supplier_id);

create index if not exists idx_supplier_response_versions_request_supplier_is_current
  on public.supplier_response_versions (request_supplier_id, is_current);

-- At most one is_current = true per invite (partial unique).
create unique index if not exists idx_supplier_response_versions_one_current_per_invite
  on public.supplier_response_versions (request_supplier_id)
  where is_current = true;

-- 4. Indexes — response_line_items.
create index if not exists idx_response_line_items_version_id
  on public.response_line_items (version_id);

create index if not exists idx_response_line_items_request_item_id
  on public.response_line_items (request_item_id);

-- 5. Enable RLS (policies — migration 013 / RSP-002).
alter table public.supplier_response_versions enable row level security;
alter table public.response_line_items enable row level security;
