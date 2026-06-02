-- Migration 007: suppliers RLS for the sourcing funnel + is_senior_or_admin() helper.
-- Spec: ai_docs/develop/architecture/auth-rls.md (RLS-политики),
--        ai_docs/develop/features/F010-supplier-sourcing.md
--
-- Context: migration 006 added the 'senior_procurement' role and the suppliers
-- sourcing funnel (sourcing_status, works_in_zapros). This migration widens the
-- suppliers write access from admin-only (set in 003) to admin + senior, and
-- narrows the SELECT so a plain authenticated user (procurement) only sees the
-- suppliers that are available for selection (approved / working_in_zapros and
-- still active). Admin keeps full access (is_senior_or_admin includes admin),
-- and DELETE remains admin-only.
--
-- Idempotent: the helper uses CREATE OR REPLACE, and every policy is dropped
-- (if exists) before being recreated, so a repeated run does not fail. Only the
-- suppliers table policies are touched here; other tables keep their 003 setup.

-- 1. Role-lookup helper, in the exact style of public.is_admin() from 003.
-- SECURITY DEFINER + pinned empty search_path: runs as owner and BYPASSES RLS
-- on public.profiles (via current_user_role), so it is safe inside policies.
-- STABLE: the result does not change within a single statement.
create or replace function public.is_senior_or_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.current_user_role() in ('admin', 'senior_procurement');
$$;

-- 2. suppliers policies.
-- SELECT  -> admin/senior see every row; everyone else (procurement and other
--            authenticated users) only sees suppliers available for selection.
-- INSERT  -> admin + senior (widened from admin-only).
-- UPDATE  -> admin + senior (funnel stage changes).
-- DELETE  -> admin only (unchanged).

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select
  to authenticated
  using (
    public.is_senior_or_admin()
    or (sourcing_status in ('approved', 'working_in_zapros') and is_active)
  );

drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers
  for insert
  to authenticated
  with check (public.is_senior_or_admin());

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers
  for update
  to authenticated
  using (public.is_senior_or_admin())
  with check (public.is_senior_or_admin());

drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers
  for delete
  to authenticated
  using (public.is_admin());
