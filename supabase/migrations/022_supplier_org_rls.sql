-- Migration 022: supplier organization RLS + current_user_supplier_id (SRC-705).
-- Spec: ai_docs/develop/features/F012-supplier-organization.md (Option A),
--        ai_docs/develop/architecture/auth-rls.md,
--        ai_docs/develop/plans/2026-06-04-phase7-7-supplier-organization.md (SRC-705).
-- Depends on: 007/008 (suppliers policies), 010 (current_user_supplier_id),
--             019–021 (org tables with RLS enabled, policies deferred).
--
-- Access model (F012 Option A):
--   * admin / senior_procurement — full read/write on org master-data.
--   * procurement — read-only on suppliers and org-scoped rows (no INSERT/UPDATE/DELETE).
--   * supplier + supplier_admin — read/write own org (suppliers row, members, sites, fleet, junctions).
--   * supplier + supplier_user — read own org; no org CRUD (request flow unchanged via 010).
--   * request_suppliers / requests — NOT modified here (isolation preserved).
--
-- Idempotent: helpers use CREATE OR REPLACE; every policy is dropped (if exists)
-- before being recreated.

-- 1. Helpers (SECURITY DEFINER + empty search_path — safe inside policies, bypass RLS).

-- Active membership first, then profiles.supplier_id for legacy compat (F012 §41–43).
create or replace function public.current_user_supplier_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (
      select sm.supplier_id
      from public.supplier_members sm
      where sm.user_id = (select auth.uid())
        and sm.is_active
      limit 1
    ),
    (
      select p.supplier_id
      from public.profiles p
      where p.id = (select auth.uid())
    )
  );
$$;

create or replace function public.is_supplier_user()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.current_user_role() = 'supplier'
    and public.current_user_supplier_id() is not null;
$$;

create or replace function public.is_supplier_org_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.supplier_members sm
    where sm.user_id = (select auth.uid())
      and sm.is_active
      and sm.member_role = 'supplier_admin'::public.supplier_member_role
      and sm.supplier_id = public.current_user_supplier_id()
  );
$$;

-- Read org-scoped rows: internal roles + procurement (Option A) + supplier portal (own org).
create or replace function public.can_read_supplier_org(p_supplier_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    public.is_senior_or_admin()
    or public.current_user_role() = 'procurement'
    or (
      public.is_supplier_user()
      and p_supplier_id = public.current_user_supplier_id()
    );
$$;

-- Write org-scoped rows: admin/senior or supplier_admin on own org only.
create or replace function public.can_write_supplier_org(p_supplier_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    public.is_senior_or_admin()
    or (
      public.is_supplier_org_admin()
      and p_supplier_id = public.current_user_supplier_id()
    );
$$;

-- 2. suppliers — widen procurement SELECT (Option A); supplier portal UPDATE own org.
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select
  to authenticated
  using (
    public.is_senior_or_admin()
    or public.current_user_role() = 'procurement'
    or (
      public.is_supplier_user()
      and id = public.current_user_supplier_id()
    )
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
  using (
    public.is_senior_or_admin()
    or (
      public.is_supplier_org_admin()
      and id = public.current_user_supplier_id()
    )
  )
  with check (
    public.is_senior_or_admin()
    or (
      public.is_supplier_org_admin()
      and id = public.current_user_supplier_id()
    )
  );

drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers
  for delete
  to authenticated
  using (public.is_admin());

-- 3. supplier_members
drop policy if exists supplier_members_select on public.supplier_members;
create policy supplier_members_select on public.supplier_members
  for select
  to authenticated
  using (public.can_read_supplier_org(supplier_id));

drop policy if exists supplier_members_insert on public.supplier_members;
create policy supplier_members_insert on public.supplier_members
  for insert
  to authenticated
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_members_update on public.supplier_members;
create policy supplier_members_update on public.supplier_members
  for update
  to authenticated
  using (public.can_write_supplier_org(supplier_id))
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_members_delete on public.supplier_members;
create policy supplier_members_delete on public.supplier_members
  for delete
  to authenticated
  using (public.can_write_supplier_org(supplier_id));

-- 4. supplier_warehouses
drop policy if exists supplier_warehouses_select on public.supplier_warehouses;
create policy supplier_warehouses_select on public.supplier_warehouses
  for select
  to authenticated
  using (public.can_read_supplier_org(supplier_id));

drop policy if exists supplier_warehouses_insert on public.supplier_warehouses;
create policy supplier_warehouses_insert on public.supplier_warehouses
  for insert
  to authenticated
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_warehouses_update on public.supplier_warehouses;
create policy supplier_warehouses_update on public.supplier_warehouses
  for update
  to authenticated
  using (public.can_write_supplier_org(supplier_id))
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_warehouses_delete on public.supplier_warehouses;
create policy supplier_warehouses_delete on public.supplier_warehouses
  for delete
  to authenticated
  using (public.can_write_supplier_org(supplier_id));

-- 5. supplier_productions
drop policy if exists supplier_productions_select on public.supplier_productions;
create policy supplier_productions_select on public.supplier_productions
  for select
  to authenticated
  using (public.can_read_supplier_org(supplier_id));

drop policy if exists supplier_productions_insert on public.supplier_productions;
create policy supplier_productions_insert on public.supplier_productions
  for insert
  to authenticated
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_productions_update on public.supplier_productions;
create policy supplier_productions_update on public.supplier_productions
  for update
  to authenticated
  using (public.can_write_supplier_org(supplier_id))
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_productions_delete on public.supplier_productions;
create policy supplier_productions_delete on public.supplier_productions
  for delete
  to authenticated
  using (public.can_write_supplier_org(supplier_id));

-- 6. supplier_vehicles
drop policy if exists supplier_vehicles_select on public.supplier_vehicles;
create policy supplier_vehicles_select on public.supplier_vehicles
  for select
  to authenticated
  using (public.can_read_supplier_org(supplier_id));

drop policy if exists supplier_vehicles_insert on public.supplier_vehicles;
create policy supplier_vehicles_insert on public.supplier_vehicles
  for insert
  to authenticated
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_vehicles_update on public.supplier_vehicles;
create policy supplier_vehicles_update on public.supplier_vehicles
  for update
  to authenticated
  using (public.can_write_supplier_org(supplier_id))
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_vehicles_delete on public.supplier_vehicles;
create policy supplier_vehicles_delete on public.supplier_vehicles
  for delete
  to authenticated
  using (public.can_write_supplier_org(supplier_id));

-- 7. product_categories / product_brands — reference catalogs (read all authenticated).
drop policy if exists product_categories_select on public.product_categories;
create policy product_categories_select on public.product_categories
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists product_categories_insert on public.product_categories;
create policy product_categories_insert on public.product_categories
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists product_categories_update on public.product_categories;
create policy product_categories_update on public.product_categories
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists product_categories_delete on public.product_categories;
create policy product_categories_delete on public.product_categories
  for delete
  to authenticated
  using (public.is_admin());

drop policy if exists product_brands_select on public.product_brands;
create policy product_brands_select on public.product_brands
  for select
  to authenticated
  using ((select auth.uid()) is not null);

drop policy if exists product_brands_insert on public.product_brands;
create policy product_brands_insert on public.product_brands
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists product_brands_update on public.product_brands;
create policy product_brands_update on public.product_brands
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists product_brands_delete on public.product_brands;
create policy product_brands_delete on public.product_brands
  for delete
  to authenticated
  using (public.is_admin());

-- 8. supplier_categories / supplier_brands — org junctions (same pattern as sites).
drop policy if exists supplier_categories_select on public.supplier_categories;
create policy supplier_categories_select on public.supplier_categories
  for select
  to authenticated
  using (public.can_read_supplier_org(supplier_id));

drop policy if exists supplier_categories_insert on public.supplier_categories;
create policy supplier_categories_insert on public.supplier_categories
  for insert
  to authenticated
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_categories_update on public.supplier_categories;
create policy supplier_categories_update on public.supplier_categories
  for update
  to authenticated
  using (public.can_write_supplier_org(supplier_id))
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_categories_delete on public.supplier_categories;
create policy supplier_categories_delete on public.supplier_categories
  for delete
  to authenticated
  using (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_brands_select on public.supplier_brands;
create policy supplier_brands_select on public.supplier_brands
  for select
  to authenticated
  using (public.can_read_supplier_org(supplier_id));

drop policy if exists supplier_brands_insert on public.supplier_brands;
create policy supplier_brands_insert on public.supplier_brands
  for insert
  to authenticated
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_brands_update on public.supplier_brands;
create policy supplier_brands_update on public.supplier_brands
  for update
  to authenticated
  using (public.can_write_supplier_org(supplier_id))
  with check (public.can_write_supplier_org(supplier_id));

drop policy if exists supplier_brands_delete on public.supplier_brands;
create policy supplier_brands_delete on public.supplier_brands
  for delete
  to authenticated
  using (public.can_write_supplier_org(supplier_id));
