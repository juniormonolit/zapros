-- Migration 009: requests + request_items + request_suppliers schema, supporting
-- enums and the race-safe request_code generator (REQ-001, Phase 3).
-- Spec: ai_docs/develop/architecture/data-model.md (requests, request_items,
--        request_suppliers, app_settings, indexes),
--        ai_docs/develop/architecture/status-machines.md (request / invite statuses).
--
-- Idempotent: enums are guarded against duplicate_object, the sequence/function
-- use IF NOT EXISTS / CREATE OR REPLACE, tables and indexes use IF NOT EXISTS,
-- triggers are dropped before being recreated, and the deferred FK is guarded
-- against duplicate. RLS is enabled but NO policies are defined here (see REQ-002).
--
-- The runner wraps this whole file in a single transaction. Every CREATE TYPE
-- below is brand new (first use of these enums), so referencing them in column
-- definitions within the same transaction is safe.

-- 1. Enums (guarded for idempotency).

-- request_status: procurement kanban lifecycle of a whole request.
do $$ begin
  create type public.request_status as enum (
    'draft',
    'new',
    'awaiting_responses',
    'has_response',
    'clarification',
    'in_progress',
    'won',
    'lost',
    'no_response',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

-- request_supplier_status: per-invite (supplier) kanban lifecycle.
do $$ begin
  create type public.request_supplier_status as enum (
    'new',
    'answered',
    'under_review',
    'clarification',
    'in_progress',
    'lost',
    'no_response',
    'won'
  );
exception
  when duplicate_object then null;
end $$;

-- request_outcome: final result of a request (set in Phase 7).
do $$ begin
  create type public.request_outcome as enum ('won', 'lost', 'cancelled');
exception
  when duplicate_object then null;
end $$;

-- reject_reason: shared loss reason across losing invites (used in Phase 7).
do $$ begin
  create type public.reject_reason as enum (
    'price',
    'lead_time',
    'availability',
    'other_supplier_selected',
    'customer_cancelled',
    'no_response',
    'other'
  );
exception
  when duplicate_object then null;
end $$;

-- 2. Human-readable request code generator.
-- A sequence guarantees uniqueness without races; the function formats it as
-- R-<year-MSK>-<6 zero-padded digits>, e.g. R-2026-000123. The year is taken in
-- Europe/Moscow to match the rest of the request timezone handling.
create sequence if not exists public.request_code_seq;

create or replace function public.next_request_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'R-'
    || to_char((now() at time zone 'Europe/Moscow'), 'YYYY')
    || '-'
    || lpad(nextval('public.request_code_seq')::text, 6, '0');
$$;

-- 3. requests table.
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique default public.next_request_code(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  status public.request_status not null default 'draft',
  outcome public.request_outcome,
  needs_delivery boolean not null default false,
  payment_form public.payment_form,
  comment text,
  winning_supplier_id uuid references public.suppliers (id) on delete set null,
  winning_request_supplier_id uuid,
  reject_reason public.reject_reason,
  reject_comment text,
  sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. request_items table (snapshot of task_items at send time).
create table if not exists public.request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  task_item_id uuid references public.task_items (id) on delete set null,
  name text not null,
  quantity numeric,
  unit text,
  sort_order int not null default 0
);

-- 5. request_suppliers table (request<->supplier invite, timer, kanban).
create table if not exists public.request_suppliers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id),
  status public.request_supplier_status not null default 'new',
  sent_at timestamptz,
  deadline_at timestamptz,
  timer_paused_at timestamptz,
  first_response_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, supplier_id)
);

-- 5b. Deferred FK: requests.winning_request_supplier_id -> request_suppliers(id).
-- Added after request_suppliers exists to avoid a circular table dependency.
-- Guarded so repeated runs do not fail.
do $$ begin
  alter table public.requests
    add constraint requests_winning_request_supplier_id_fkey
    foreign key (winning_request_supplier_id)
    references public.request_suppliers (id) on delete set null;
exception
  when duplicate_object then null;
end $$;

-- 6. Indexes (data-model.md recommendations).
create index if not exists idx_requests_task_id on public.requests (task_id);
create index if not exists idx_requests_created_by on public.requests (created_by);
create index if not exists idx_requests_status on public.requests (status);
create index if not exists idx_request_items_request_id on public.request_items (request_id);
create index if not exists idx_request_items_task_item_id on public.request_items (task_item_id);
create index if not exists idx_request_suppliers_supplier_id on public.request_suppliers (supplier_id);
create index if not exists idx_request_suppliers_request_id on public.request_suppliers (request_id);
create index if not exists idx_request_suppliers_deadline_at on public.request_suppliers (deadline_at);

-- 7. updated_at triggers (reuse public.set_updated_at() from migration 004).
drop trigger if exists set_requests_updated_at on public.requests;
create trigger set_requests_updated_at
  before update on public.requests
  for each row
  execute function public.set_updated_at();

drop trigger if exists set_request_suppliers_updated_at on public.request_suppliers;
create trigger set_request_suppliers_updated_at
  before update on public.request_suppliers
  for each row
  execute function public.set_updated_at();

-- 8. Enable RLS (policies are defined in migration 010 / REQ-002).
-- Enabling an already-enabled table is a no-op (idempotent).
alter table public.requests enable row level security;
alter table public.request_items enable row level security;
alter table public.request_suppliers enable row level security;
