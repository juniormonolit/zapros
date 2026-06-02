-- Migration 008: suppliers hardening (code-review follow-ups).
-- Spec: ai_docs/develop/architecture/auth-rls.md (RLS-политики),
--        ai_docs/develop/features/F010-supplier-sourcing.md
--
-- Two Medium-severity review findings are addressed here:
--   1. works_in_zapros was kept in sync with sourcing_status only in app code.
--      A BEFORE INSERT OR UPDATE trigger makes the database the single source of
--      truth: works_in_zapros is always derived from the funnel stage.
--   2. The 007 suppliers_select policy let ANY authenticated role (including the
--      'supplier' role) read available suppliers' contacts/notes. It is narrowed
--      so admin/senior see every row, 'procurement' sees only the available rows,
--      and 'supplier' (and any other role) sees nothing.
--
-- Idempotent: the function uses CREATE OR REPLACE, the trigger is dropped before
-- being recreated, the backfill is a conditional unconditional-safe UPDATE, and
-- the policy is dropped (if exists) before being recreated.

-- 1. Keep works_in_zapros derived from sourcing_status at the DB level.
-- Plain trigger function (no SECURITY DEFINER needed): it only rewrites NEW on
-- the row being written. Pinned empty search_path in the project style.
create or replace function public.sync_supplier_works_in_zapros()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.works_in_zapros := (new.sourcing_status = 'working_in_zapros'::public.supplier_sourcing_status);
  return new;
end;
$$;

drop trigger if exists suppliers_sync_works_in_zapros on public.suppliers;
create trigger suppliers_sync_works_in_zapros
  before insert or update on public.suppliers
  for each row
  execute function public.sync_supplier_works_in_zapros();

-- Backfill any drifted rows. Conditional WHERE keeps repeated runs as no-ops.
update public.suppliers
set works_in_zapros = (sourcing_status = 'working_in_zapros')
where works_in_zapros <> (sourcing_status = 'working_in_zapros');

-- 2. Narrow suppliers SELECT: drop access for the 'supplier' role.
-- admin/senior  -> every row (is_senior_or_admin).
-- procurement   -> only suppliers available for selection (approved / working_in_zapros and active).
-- supplier/other-> no rows.
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select
  to authenticated
  using (
    public.is_senior_or_admin()
    or (
      public.current_user_role() = 'procurement'
      and sourcing_status in ('approved', 'working_in_zapros')
      and is_active
    )
  );
