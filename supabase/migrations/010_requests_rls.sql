-- Migration 010: RLS policies for requests + request_items + request_suppliers
-- (REQ-002, Phase 3).
-- Spec: ai_docs/develop/architecture/auth-rls.md (requests, request_suppliers),
--        ai_docs/develop/plans/2026-06-02-phase3-requests.md (REQ-002,
--        competitor isolation).
--
-- Access model:
--   * procurement (owner) -> full CRUD on their own requests (created_by =
--     auth.uid()) and the request_items / request_suppliers underneath them.
--   * admin -> full access everywhere.
--   * supplier -> READ-ONLY on the requests they were invited to (sent, not
--     draft) and the matching request_items; on request_suppliers a supplier
--     sees ONLY their own invite row (supplier_id = profile.supplier_id) and
--     NEVER the invites/data of competing suppliers on the same request.
--   * supplier never INSERT/UPDATE/DELETE requests, request_items or
--     request_suppliers (invite status changes are done by server actions in a
--     later phase).
--
-- Recursion safety: requests <-> request_suppliers reference each other, so all
-- cross-table lookups go through SECURITY DEFINER helpers (search_path = '')
-- that BYPASS RLS, exactly like current_user_role()/is_admin() in migration 003.
-- This prevents policy re-entry (error 42P17) and keeps the checks cheap.
--
-- Idempotent: helpers use CREATE OR REPLACE; every policy is dropped (if exists)
-- before being recreated; enabling RLS is a no-op when already enabled.

-- 1. SECURITY DEFINER helpers.

-- The suppliers.id linked to the current user's profile, or NULL for non-supplier
-- roles. Mirrors current_user_role(): SECURITY DEFINER + empty search_path so it
-- bypasses RLS on profiles and is safe to call from within policies.
create or replace function public.current_user_supplier_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select supplier_id
  from public.profiles
  where id = (select auth.uid());
$$;

-- True when the current user owns the given request (requests.created_by =
-- auth.uid()). SECURITY DEFINER so reading public.requests here does NOT re-enter
-- the requests policies.
create or replace function public.owns_request(p_request_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.requests r
    where r.id = p_request_id
      and r.created_by = (select auth.uid())
  );
$$;

-- True when the current supplier may READ the given request: they hold an invite
-- on it AND the request has actually been sent (status <> 'draft' and sent_at is
-- set). Drafts are never visible to suppliers. SECURITY DEFINER so the
-- request_suppliers / requests reads bypass RLS (no competitor leak, no
-- recursion). Returns false for non-suppliers because current_user_supplier_id()
-- is NULL for them.
create or replace function public.supplier_can_read_request(p_request_id uuid)
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
    where rs.request_id = p_request_id
      and rs.supplier_id = public.current_user_supplier_id()
      and r.status <> 'draft'
      and r.sent_at is not null
  );
$$;

-- 2. Enable RLS (idempotent: enabling an already-enabled table is a no-op).
alter table public.requests enable row level security;
alter table public.request_items enable row level security;
alter table public.request_suppliers enable row level security;

-- 3. requests policies.
-- SELECT  -> owner, admin, or an invited supplier (sent requests only).
-- INSERT  -> own row, and only procurement/senior_procurement/admin roles.
-- UPDATE  -> owner or admin.
-- DELETE  -> owner or admin.
drop policy if exists requests_select on public.requests;
create policy requests_select on public.requests
  for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or public.is_admin()
    or public.supplier_can_read_request(requests.id)
  );

drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      public.is_admin()
      or public.current_user_role() in ('procurement', 'senior_procurement')
    )
  );

drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests
  for update
  to authenticated
  using (created_by = (select auth.uid()) or public.is_admin())
  with check (created_by = (select auth.uid()) or public.is_admin());

drop policy if exists requests_delete on public.requests;
create policy requests_delete on public.requests
  for delete
  to authenticated
  using (created_by = (select auth.uid()) or public.is_admin());

-- 4. request_items policies.
-- Access is derived from the parent request:
--   SELECT  -> owner/admin of the request, or an invited supplier (read-only).
--   INSERT/UPDATE/DELETE -> owner or admin only (suppliers never write).
drop policy if exists request_items_select on public.request_items;
create policy request_items_select on public.request_items
  for select
  to authenticated
  using (
    public.owns_request(request_items.request_id)
    or public.is_admin()
    or public.supplier_can_read_request(request_items.request_id)
  );

drop policy if exists request_items_insert on public.request_items;
create policy request_items_insert on public.request_items
  for insert
  to authenticated
  with check (
    public.owns_request(request_items.request_id) or public.is_admin()
  );

drop policy if exists request_items_update on public.request_items;
create policy request_items_update on public.request_items
  for update
  to authenticated
  using (
    public.owns_request(request_items.request_id) or public.is_admin()
  )
  with check (
    public.owns_request(request_items.request_id) or public.is_admin()
  );

drop policy if exists request_items_delete on public.request_items;
create policy request_items_delete on public.request_items
  for delete
  to authenticated
  using (
    public.owns_request(request_items.request_id) or public.is_admin()
  );

-- 5. request_suppliers policies (competitor isolation lives here).
-- SELECT  -> owner/admin see EVERY invite of the request; a supplier sees ONLY
--            their own row (supplier_id = profile.supplier_id) and therefore
--            never the existence or data of competing suppliers' invites.
-- INSERT/UPDATE/DELETE -> owner or admin only. Suppliers do not create invites
--            and do not change invite status directly (server actions handle
--            status transitions in later phases).
drop policy if exists request_suppliers_select on public.request_suppliers;
create policy request_suppliers_select on public.request_suppliers
  for select
  to authenticated
  using (
    public.owns_request(request_suppliers.request_id)
    or public.is_admin()
    or request_suppliers.supplier_id = public.current_user_supplier_id()
  );

drop policy if exists request_suppliers_insert on public.request_suppliers;
create policy request_suppliers_insert on public.request_suppliers
  for insert
  to authenticated
  with check (
    public.owns_request(request_suppliers.request_id) or public.is_admin()
  );

drop policy if exists request_suppliers_update on public.request_suppliers;
create policy request_suppliers_update on public.request_suppliers
  for update
  to authenticated
  using (
    public.owns_request(request_suppliers.request_id) or public.is_admin()
  )
  with check (
    public.owns_request(request_suppliers.request_id) or public.is_admin()
  );

drop policy if exists request_suppliers_delete on public.request_suppliers;
create policy request_suppliers_delete on public.request_suppliers
  for delete
  to authenticated
  using (
    public.owns_request(request_suppliers.request_id) or public.is_admin()
  );
