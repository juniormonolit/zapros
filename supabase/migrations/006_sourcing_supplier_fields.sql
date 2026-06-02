-- Migration 006: senior_procurement role, supplier sourcing funnel enum,
-- new suppliers columns, and backfill of active suppliers.
-- Spec: ai_docs/develop/architecture/data-model.md (suppliers, sourcing funnel),
--        ai_docs/develop/features/F010-supplier-sourcing.md
--
-- NOTE on ALTER TYPE ... ADD VALUE inside a transaction:
-- The runner wraps this whole file in a single transaction. A value added to an
-- EXISTING enum (user_role) cannot be referenced in DML in the same transaction,
-- so 'senior_procurement' is ONLY added here and is NOT used in any UPDATE/WHERE.
-- The freshly CREATEd enum (supplier_sourcing_status) is safe to use immediately,
-- which is what the backfill below relies on.

-- 1. Add the 'senior_procurement' role value, idempotently, ordered between
--    'admin' and 'procurement'. Added only; never used in DML in this file.
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'user_role' and e.enumlabel = 'senior_procurement'
  ) then
    alter type public.user_role add value 'senior_procurement' before 'procurement';
  end if;
end $$;

-- 2. Supplier sourcing funnel enum (guarded create).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'supplier_sourcing_status') then
    create type public.supplier_sourcing_status as enum
      ('new', 'called', 'clarified', 'got_price', 'test_order', 'approved', 'working_in_zapros', 'rejected');
  end if;
end $$;

-- 3. New suppliers columns (idempotent).
alter table public.suppliers
  add column if not exists sourcing_status public.supplier_sourcing_status not null default 'new';
alter table public.suppliers
  add column if not exists works_in_zapros boolean not null default false;
alter table public.suppliers
  add column if not exists contact_person text;
alter table public.suppliers
  add column if not exists phone text;
alter table public.suppliers
  add column if not exists email text;
alter table public.suppliers
  add column if not exists notes text;
alter table public.suppliers
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

-- 4. Backfill: active suppliers are already working in the system.
--    Unconditional update of active rows is safe to repeat (idempotent).
update public.suppliers
set sourcing_status = 'working_in_zapros',
    works_in_zapros = true
where is_active = true;

-- 5. Index to quickly find available suppliers by funnel stage among active rows.
create index if not exists suppliers_available_idx
  on public.suppliers (sourcing_status)
  where is_active;
