/**
 * Server-side helpers for per-task request counters (REQ-008).
 *
 * Reads the `public.task_request_counters` view (migration 011), which
 * aggregates `requests` grouped by `task_id` with `security_invoker = true`
 * so the existing requests RLS applies. One query backs both the task list
 * (`/app`, all tasks at once — no N+1) and the task card (`/app/tasks/[id]`,
 * a single task). Drafts are excluded; the counter is about SENT requests
 * (F002 / status-machines.md):
 *   - total      = sent requests (status <> 'draft')
 *   - inProgress = active (new, awaiting_responses, has_response,
 *                  clarification, in_progress)
 *   - completed  = terminal (outcome set, or won/lost/no_response/cancelled)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Counts shown as "завершено / в работе / всего" on a task. */
export interface RequestCounts {
  total: number;
  inProgress: number;
  completed: number;
}

/** Zero counts, used for tasks that have no (sent) requests yet. */
export const EMPTY_REQUEST_COUNTS: RequestCounts = {
  total: 0,
  inProgress: 0,
  completed: 0,
};

/** Raw row shape returned by the `task_request_counters` view. */
interface CounterRow {
  task_id: string;
  requests_total: number | string | null;
  requests_in_progress: number | string | null;
  requests_completed: number | string | null;
}

const VIEW = "task_request_counters";
const COLUMNS =
  "task_id, requests_total, requests_in_progress, requests_completed";

/** Coerce a (possibly bigint-as-string) count to a safe non-negative number. */
function toCount(value: number | string | null): number {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toCounts(row: CounterRow): RequestCounts {
  return {
    total: toCount(row.requests_total),
    inProgress: toCount(row.requests_in_progress),
    completed: toCount(row.requests_completed),
  };
}

/**
 * Fetch request counters for many tasks in one query, keyed by `task_id`.
 * Pass the task ids currently on screen to keep the query scoped; an empty
 * list short-circuits to an empty map. Tasks without a row default to
 * {@link EMPTY_REQUEST_COUNTS} at the call site.
 */
export async function fetchRequestCountsByTask(
  supabase: SupabaseClient,
  taskIds: string[],
): Promise<Map<string, RequestCounts>> {
  const counts = new Map<string, RequestCounts>();
  if (taskIds.length === 0) return counts;

  const { data } = await supabase
    .from(VIEW)
    .select(COLUMNS)
    .in("task_id", taskIds);

  for (const row of (data as CounterRow[] | null) ?? []) {
    counts.set(row.task_id, toCounts(row));
  }
  return counts;
}

/**
 * Fetch request counters for a single task. Returns
 * {@link EMPTY_REQUEST_COUNTS} when the task has no (sent) requests.
 */
export async function fetchRequestCountsForTask(
  supabase: SupabaseClient,
  taskId: string,
): Promise<RequestCounts> {
  const { data } = await supabase
    .from(VIEW)
    .select(COLUMNS)
    .eq("task_id", taskId)
    .maybeSingle<CounterRow>();

  return data ? toCounts(data) : EMPTY_REQUEST_COUNTS;
}
