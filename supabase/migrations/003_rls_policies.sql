-- Migration 003: base RLS policies (FND-006)
-- Spec: ai_docs/develop/architecture/auth-rls.md (RLS-политики)
--
-- Adds the helper role-lookup functions and the per-table policies for
-- profiles and the reference tables (suppliers, supplier_groups,
-- supplier_group_members, bitrix_group_settings, app_settings).
--
-- Access model:
--   * anon (unauthenticated): no policies -> no access anywhere.
--   * authenticated: SELECT on reference tables; own row on profiles.
--   * admin: full access to reference tables and all profiles.
--
-- Idempotent: every policy is dropped (if exists) before being recreated so a
-- repeated run does not fail.

-- 1. Role-lookup helpers.
-- SECURITY DEFINER + pinned empty search_path: the function runs as its owner
-- and therefore BYPASSES RLS when reading public.profiles. This is exactly why
-- it is safe to use inside the profiles policies themselves -- the read does
-- not re-enter the policy (no infinite recursion / error 42P17).
-- STABLE: the result does not change within a single statement.
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = ''
stable
as $$
  select role
  from public.profiles
  where id = (select auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.current_user_role() = 'admin';
$$;

-- 2. profiles policies.
-- USING clauses rely on the SECURITY DEFINER helper (is_admin) instead of a
-- direct subquery on public.profiles, so the policy never triggers RLS on
-- profiles again -> no recursion.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- No INSERT policy on purpose: profiles are created by the SECURITY DEFINER
-- trigger (handle_new_user), and admin provisioning happens via service_role.

-- 3. Reference-table policies.
-- Pattern for each table:
--   SELECT  -> any authenticated user (UI selection lists).
--   INSERT/UPDATE/DELETE -> admin only.

-- 3a. suppliers
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers
  for delete
  to authenticated
  using (public.is_admin());

-- 3b. supplier_groups
drop policy if exists supplier_groups_select on public.supplier_groups;
create policy supplier_groups_select on public.supplier_groups
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists supplier_groups_insert on public.supplier_groups;
create policy supplier_groups_insert on public.supplier_groups
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists supplier_groups_update on public.supplier_groups;
create policy supplier_groups_update on public.supplier_groups
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists supplier_groups_delete on public.supplier_groups;
create policy supplier_groups_delete on public.supplier_groups
  for delete
  to authenticated
  using (public.is_admin());

-- 3c. supplier_group_members
drop policy if exists supplier_group_members_select on public.supplier_group_members;
create policy supplier_group_members_select on public.supplier_group_members
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists supplier_group_members_insert on public.supplier_group_members;
create policy supplier_group_members_insert on public.supplier_group_members
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists supplier_group_members_update on public.supplier_group_members;
create policy supplier_group_members_update on public.supplier_group_members
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists supplier_group_members_delete on public.supplier_group_members;
create policy supplier_group_members_delete on public.supplier_group_members
  for delete
  to authenticated
  using (public.is_admin());

-- 3d. bitrix_group_settings
drop policy if exists bitrix_group_settings_select on public.bitrix_group_settings;
create policy bitrix_group_settings_select on public.bitrix_group_settings
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists bitrix_group_settings_insert on public.bitrix_group_settings;
create policy bitrix_group_settings_insert on public.bitrix_group_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists bitrix_group_settings_update on public.bitrix_group_settings;
create policy bitrix_group_settings_update on public.bitrix_group_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists bitrix_group_settings_delete on public.bitrix_group_settings;
create policy bitrix_group_settings_delete on public.bitrix_group_settings
  for delete
  to authenticated
  using (public.is_admin());

-- 3e. app_settings
drop policy if exists app_settings_select on public.app_settings;
create policy app_settings_select on public.app_settings
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists app_settings_insert on public.app_settings;
create policy app_settings_insert on public.app_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists app_settings_update on public.app_settings;
create policy app_settings_update on public.app_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists app_settings_delete on public.app_settings;
create policy app_settings_delete on public.app_settings
  for delete
  to authenticated
  using (public.is_admin());
