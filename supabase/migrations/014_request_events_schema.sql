-- Migration 014: request_events schema (EVT-001, Phase 5).
-- Spec: ai_docs/develop/architecture/data-model.md (request_events),
--        ai_docs/develop/plans/2026-06-02-phase5-communication.md (EVT-001),
--        ai_docs/develop/features/F006-threads-and-events.md.
--
-- Idempotent: enum guarded against duplicate_object; table and indexes use
-- IF NOT EXISTS. RLS is enabled (policies — migration 015 / EVT-002).
--
-- Append-only event log per request_supplier invite; no updated_at trigger.

-- 1. Enum request_event_type.
do $$ begin
  create type public.request_event_type as enum (
    'message',
    'signal_cheaper',
    'signal_customer_price',
    'signal_in_progress',
    'status_change',
    'request_updated',
    'response_submitted'
  );
exception
  when duplicate_object then null;
end $$;

-- 2. Table request_events.
create table if not exists public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_supplier_id uuid not null
    references public.request_suppliers (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  event_type public.request_event_type not null,
  payload jsonb,
  body text,
  created_at timestamptz not null default now()
);

-- 3. Indexes — feed (newest first) and FK lookups.
create index if not exists idx_request_events_request_supplier_created_at
  on public.request_events (request_supplier_id, created_at desc);

create index if not exists idx_request_events_request_supplier_id
  on public.request_events (request_supplier_id);

-- 4. Enable RLS (policies — migration 015 / EVT-002).
alter table public.request_events enable row level security;
