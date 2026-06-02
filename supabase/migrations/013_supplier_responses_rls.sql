-- Migration 013: RLS policies for supplier_response_versions + response_line_items
-- (RSP-002, Phase 4).
-- Spec: ai_docs/develop/architecture/auth-rls.md (supplier_response_versions,
--        response_line_items),
--        ai_docs/develop/plans/2026-06-02-phase4-supplier-responses.md (RSP-002,
--        competitor isolation).
--
-- Access model:
--   * supplier -> SELECT/INSERT/UPDATE only on their own versions/lines (invite
--     supplier_id = profile.supplier_id). INSERT/UPDATE blocked when invite is
--     final (lost/won/no_response) or request is draft/cancelled.
--   * procurement -> SELECT on all responses for requests they own (owns_request);
--     no INSERT/UPDATE/DELETE on versions/lines.
--   * admin -> full access; DELETE versions for housekeeping.
--   * competitor isolation: supplier A never sees versions/lines for supplier B's
--     invite on the same request.
--
-- Recursion safety: version/line policies join request_suppliers and requests, so
-- cross-table checks use SECURITY DEFINER helpers (search_path = '') that bypass
-- RLS, matching migration 010 (current_user_supplier_id, owns_request).
--
-- Idempotent: helpers use CREATE OR REPLACE; every policy is dropped (if exists)
-- before being recreated.

-- 1. SECURITY DEFINER helpers.

-- True when the current supplier may write a response on this invite: own invite,
-- request not draft/cancelled, invite in an active response status.
create or replace function public.invite_allows_supplier_response(p_request_supplier_id uuid)
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
      and rs.supplier_id = public.current_user_supplier_id()
      and r.status not in ('draft', 'cancelled')
      and rs.status in (
        'new',
        'answered',
        'under_review',
        'clarification',
        'in_progress'
      )
  );
$$;

-- True when the version belongs to the current supplier's invite.
create or replace function public.supplier_owns_version(p_version_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.supplier_response_versions v
    join public.request_suppliers rs on rs.id = v.request_supplier_id
    where v.id = p_version_id
      and rs.supplier_id = public.current_user_supplier_id()
  );
$$;

-- True when procurement may read this version (owner of parent request).
create or replace function public.procurement_can_read_version(p_version_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.supplier_response_versions v
    join public.request_suppliers rs on rs.id = v.request_supplier_id
    where v.id = p_version_id
      and public.owns_request(rs.request_id)
  );
$$;

-- Parent version is insertable by supplier (owns invite path + active invite).
create or replace function public.version_allows_supplier_line_insert(p_version_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.supplier_response_versions v
    where v.id = p_version_id
      and public.supplier_owns_version(v.id)
      and public.invite_allows_supplier_response(v.request_supplier_id)
  );
$$;

-- 2. Enable RLS (idempotent; already enabled in 012).
alter table public.supplier_response_versions enable row level security;
alter table public.response_line_items enable row level security;

-- 3. supplier_response_versions policies.

drop policy if exists supplier_response_versions_select on public.supplier_response_versions;
create policy supplier_response_versions_select on public.supplier_response_versions
  for select
  to authenticated
  using (
    public.supplier_owns_version(id)
    or public.procurement_can_read_version(id)
    or public.is_admin()
  );

drop policy if exists supplier_response_versions_insert on public.supplier_response_versions;
create policy supplier_response_versions_insert on public.supplier_response_versions
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.invite_allows_supplier_response(request_supplier_id)
      and created_by = (select auth.uid())
    )
  );

-- Supplier may UPDATE own versions while invite still allows responses (e.g.
-- is_current flip); procurement has no UPDATE path; versions are not deletable
-- by suppliers.
drop policy if exists supplier_response_versions_update on public.supplier_response_versions;
create policy supplier_response_versions_update on public.supplier_response_versions
  for update
  to authenticated
  using (
    public.is_admin()
    or (
      public.supplier_owns_version(id)
      and public.invite_allows_supplier_response(request_supplier_id)
    )
  )
  with check (
    public.is_admin()
    or (
      public.supplier_owns_version(id)
      and public.invite_allows_supplier_response(request_supplier_id)
    )
  );

drop policy if exists supplier_response_versions_delete on public.supplier_response_versions;
create policy supplier_response_versions_delete on public.supplier_response_versions
  for delete
  to authenticated
  using (public.is_admin());

-- 4. response_line_items policies.
-- Lines are immutable after submit for suppliers: INSERT only (no UPDATE/DELETE
-- policies -> denied by default). Admin DELETE for support via service patterns.

drop policy if exists response_line_items_select on public.response_line_items;
create policy response_line_items_select on public.response_line_items
  for select
  to authenticated
  using (
    public.supplier_owns_version(version_id)
    or public.procurement_can_read_version(version_id)
    or public.is_admin()
  );

drop policy if exists response_line_items_insert on public.response_line_items;
create policy response_line_items_insert on public.response_line_items
  for insert
  to authenticated
  with check (
    public.is_admin()
    or public.version_allows_supplier_line_insert(version_id)
  );

drop policy if exists response_line_items_delete on public.response_line_items;
create policy response_line_items_delete on public.response_line_items
  for delete
  to authenticated
  using (public.is_admin());
