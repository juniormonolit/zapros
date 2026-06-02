-- Migration 011: task_request_counters view — real request counters per task
-- (REQ-008, Phase 3).
-- Spec: ai_docs/develop/features/F002-create-request-from-task.md (counter rules),
--        ai_docs/develop/architecture/status-machines.md (request statuses),
--        ai_docs/develop/plans/2026-06-02-phase3-requests.md (REQ-008).
--
-- Aggregates public.requests grouped by task_id so the task list (/app) can
-- read all counters in a single query (no N+1) and the task card can read one
-- row by task_id. Drafts are unsent and excluded from every counter — the
-- counter is about SENT requests (F002).
--
-- Counter rules (F002 / status-machines.md):
--   * requests_total       = sent requests  (status <> 'draft')
--   * requests_in_progress = still active    (new, awaiting_responses,
--                            has_response, clarification, in_progress)
--   * requests_completed   = terminal        (outcome IS NOT NULL OR status IN
--                            won, lost, no_response, cancelled)
-- Active + terminal partition the non-draft statuses, so
-- requests_in_progress + requests_completed = requests_total.
--
-- RLS: security_invoker = true makes the view run with the querying user's
-- privileges, so the existing requests RLS (migration 010) applies — a
-- procurement specialist only counts their own requests, an admin counts all.
-- Tasks with no (sent) requests simply have no row here; callers default to 0.
--
-- Idempotent: CREATE OR REPLACE VIEW. Re-running is a no-op when unchanged.

create or replace view public.task_request_counters
with (security_invoker = true) as
select
  r.task_id,
  count(*) filter (where r.status <> 'draft') as requests_total,
  count(*) filter (
    where r.status in (
      'new',
      'awaiting_responses',
      'has_response',
      'clarification',
      'in_progress'
    )
  ) as requests_in_progress,
  count(*) filter (
    where r.outcome is not null
      or r.status in ('won', 'lost', 'no_response', 'cancelled')
  ) as requests_completed
from public.requests r
group by r.task_id;

comment on view public.task_request_counters is
  'Per-task request counters (total/in_progress/completed) for the procurement '
  'task list and task card. security_invoker=true so requests RLS applies. '
  'Drafts are excluded; see REQ-008 / F002.';
