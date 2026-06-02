-- Migration 005: RLS policies for tasks + task_items (BTX-002).
-- Spec: ai_docs/develop/architecture/auth-rls.md (tasks, task_items).
--
-- Access model:
--   * anon (unauthenticated): no policies -> no access.
--   * authenticated: own tasks (created_by = auth.uid()); admin -> all.
--   * task_items inherit access from their parent task.
--
-- Reuses the SECURITY DEFINER helper public.is_admin() from migration 003.
-- Idempotent: every policy is dropped (if exists) before being recreated, so a
-- repeated run does not fail.

-- 1. Enable RLS (idempotent: enabling an already-enabled table is a no-op).
alter table public.tasks enable row level security;
alter table public.task_items enable row level security;

-- 2. tasks policies.
-- Ownership check uses created_by; admin gets full access via is_admin().
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select
  to authenticated
  using (created_by = (select auth.uid()) or public.is_admin());

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert
  to authenticated
  with check (created_by = (select auth.uid()) or public.is_admin());

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update
  to authenticated
  using (created_by = (select auth.uid()) or public.is_admin())
  with check (created_by = (select auth.uid()) or public.is_admin());

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete
  to authenticated
  using (public.is_admin());

-- 3. task_items policies.
-- Access is derived from the parent task: a row is visible/writable only if the
-- caller owns (or is admin on) the task referenced by task_id.
drop policy if exists task_items_select on public.task_items;
create policy task_items_select on public.task_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_items.task_id
        and (t.created_by = (select auth.uid()) or public.is_admin())
    )
  );

drop policy if exists task_items_insert on public.task_items;
create policy task_items_insert on public.task_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.tasks t
      where t.id = task_items.task_id
        and (t.created_by = (select auth.uid()) or public.is_admin())
    )
  );

drop policy if exists task_items_update on public.task_items;
create policy task_items_update on public.task_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_items.task_id
        and (t.created_by = (select auth.uid()) or public.is_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.tasks t
      where t.id = task_items.task_id
        and (t.created_by = (select auth.uid()) or public.is_admin())
    )
  );

drop policy if exists task_items_delete on public.task_items;
create policy task_items_delete on public.task_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_items.task_id
        and (t.created_by = (select auth.uid()) or public.is_admin())
    )
  );
