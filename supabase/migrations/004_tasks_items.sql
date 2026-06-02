-- Migration 004: tasks + task_items tables and supporting enums.
-- Spec: ai_docs/develop/architecture/data-model.md (tasks, task_items),
--        ai_docs/develop/architecture/status-machines.md (statuses).
-- Idempotent: enums are guarded against duplicate_object, tables/indexes use
-- IF NOT EXISTS. RLS policies are intentionally NOT defined here (see BTX-002).

-- 1. Enums (guarded for idempotency).

-- task_status: lifecycle of a procurement task.
do $$ begin
  create type public.task_status as enum ('active', 'partially_closed', 'completed', 'archived');
exception
  when duplicate_object then null;
end $$;

-- line_status: lifecycle of a single task line item.
do $$ begin
  create type public.line_status as enum ('free', 'in_request', 'closed', 'rejected');
exception
  when duplicate_object then null;
end $$;

-- payment_form: not created in migration 001, so create it here (guarded).
do $$ begin
  create type public.payment_form as enum ('cash', 'non_cash');
exception
  when duplicate_object then null;
end $$;

-- 2. updated_at trigger function (not present in earlier migrations).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3. tasks table.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id),
  bitrix_task_number integer not null unique,
  bitrix_url text,
  title text,
  manager_name text,
  delivery_address text,
  payment_form public.payment_form,
  delivery_date date,
  category text,
  purposes text,
  deal_title text,
  requested_at timestamptz,
  raw_paste text not null,
  status public.task_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. task_items table.
create table if not exists public.task_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  sort_order int not null default 0,
  name text not null,
  quantity numeric,
  unit text,
  comment text,
  line_status public.line_status not null default 'free'
);

-- 5. Indexes (bitrix_task_number is already UNIQUE via the column constraint).
create index if not exists idx_tasks_created_by on public.tasks (created_by);
create index if not exists idx_task_items_task_id on public.task_items (task_id);

-- 6. updated_at trigger for tasks (drop-and-create keeps this idempotent).
drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
  before update on public.tasks
  for each row
  execute function public.set_updated_at();
