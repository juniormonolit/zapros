-- Migration 015: RLS policies for request_events (EVT-002, Phase 5).
-- Spec: ai_docs/develop/architecture/auth-rls.md (request_events),
--        ai_docs/develop/plans/2026-06-02-phase5-communication.md (EVT-002,
--        competitor isolation).
--
-- Access model:
--   * procurement -> SELECT/INSERT on events for invites on requests they own
--     (owns_request via invite); INSERT limited to message, signals, status_change,
--     request_updated.
--   * supplier -> SELECT/INSERT only for own invite (supplier_id =
--     current_user_supplier_id()); INSERT limited to message, response_submitted.
--   * admin -> full SELECT/INSERT.
--   * competitor isolation: supplier A never sees or inserts events for supplier B's
--     invite on the same request_id.
--   * append-only: no UPDATE/DELETE policies (denied by default).
--
-- Recursion safety: policies join request_suppliers and requests via SECURITY DEFINER
-- helpers (search_path = ''), matching migrations 010 and 013.
--
-- Idempotent: helpers use CREATE OR REPLACE; every policy is dropped (if exists)
-- before being recreated.

-- 1. SECURITY DEFINER helpers.

-- True when procurement owns the parent request of this invite.
create or replace function public.procurement_owns_invite(p_request_supplier_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.request_suppliers rs
    where rs.id = p_request_supplier_id
      and public.owns_request(rs.request_id)
  );
$$;

-- True when the current supplier holds this invite row.
create or replace function public.supplier_owns_invite(p_request_supplier_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.request_suppliers rs
    where rs.id = p_request_supplier_id
      and rs.supplier_id = public.current_user_supplier_id()
  );
$$;

-- Active invite + non-draft/cancelled request; caller must be procurement owner or
-- the invited supplier (mirrors invite_allows_supplier_response + owns_request).
create or replace function public.invite_allows_thread_write(p_request_supplier_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.request_suppliers rs
    join public.requests r on r.id = rs.request_id
    where rs.id = p_request_supplier_id
      and r.status not in ('draft', 'cancelled')
      and rs.status in (
        'new',
        'answered',
        'under_review',
        'clarification',
        'in_progress'
      )
      and (
        public.owns_request(rs.request_id)
        or rs.supplier_id = public.current_user_supplier_id()
      )
  );
$$;

-- 2. Enable RLS (idempotent; already enabled in 014).
alter table public.request_events enable row level security;

-- 3. request_events policies.

drop policy if exists request_events_select on public.request_events;
create policy request_events_select on public.request_events
  for select
  to authenticated
  using (
    public.procurement_owns_invite(request_supplier_id)
    or public.supplier_owns_invite(request_supplier_id)
    or public.is_admin()
  );

-- Procurement participant: message, signals, status_change, request_updated.
drop policy if exists request_events_insert_procurement on public.request_events;
create policy request_events_insert_procurement on public.request_events
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.procurement_owns_invite(request_supplier_id)
      and public.invite_allows_thread_write(request_supplier_id)
      and author_id = (select auth.uid())
      and event_type in (
        'message',
        'signal_cheaper',
        'signal_customer_price',
        'signal_in_progress',
        'status_change',
        'request_updated'
      )
    )
  );

-- Supplier participant: message and response_submitted only.
drop policy if exists request_events_insert_supplier on public.request_events;
create policy request_events_insert_supplier on public.request_events
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.supplier_owns_invite(request_supplier_id)
      and public.invite_allows_thread_write(request_supplier_id)
      and author_id = (select auth.uid())
      and event_type in ('message', 'response_submitted')
    )
  );
