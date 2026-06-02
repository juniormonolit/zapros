-- Migration 016: fix supplier_response_versions SELECT for INSERT ... RETURNING (RSP-002).
-- supplier_owns_version(id) can fail during PostgREST insert+select RETURNING even when
-- the row is readable afterward; supplier_owns_invite(request_supplier_id) matches
-- on the invite FK directly (helper from migration 015).

drop policy if exists supplier_response_versions_select on public.supplier_response_versions;
create policy supplier_response_versions_select on public.supplier_response_versions
  for select
  to authenticated
  using (
    public.supplier_owns_invite(request_supplier_id)
    or public.supplier_owns_version(id)
    or public.procurement_can_read_version(id)
    or public.is_admin()
  );
