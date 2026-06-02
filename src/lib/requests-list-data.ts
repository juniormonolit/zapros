import type { RequestListItem } from "@/components/requests/request-list";
import { describeDeadline } from "@/lib/request-status";

/** Joined `tasks` columns for request list/kanban/table. */
export interface RequestTaskJoin {
  bitrix_task_number: number | null;
  title: string | null;
  deal_title: string | null;
  category: string | null;
}

export interface RequestSupplierJoin {
  status: string;
  deadline_at: string | null;
  supplier_id: string;
}

export interface RequestRow {
  id: string;
  request_code: string;
  status: string;
  sent_at: string | null;
  created_at: string | null;
  task_id: string;
  tasks: RequestTaskJoin | null;
  request_suppliers: RequestSupplierJoin[] | null;
}

const FINAL_INVITE_STATUSES = new Set(["lost", "won", "no_response"]);

const FINAL_REQUEST_STATUSES = new Set([
  "lost",
  "won",
  "no_response",
  "cancelled",
]);

export function nearestDeadline(
  invites: RequestSupplierJoin[] | null,
): string | null {
  if (!invites || invites.length === 0) return null;

  let nearest: number | null = null;
  let nearestIso: string | null = null;
  for (const invite of invites) {
    if (!invite.deadline_at) continue;
    if (FINAL_INVITE_STATUSES.has(invite.status)) continue;
    const time = new Date(invite.deadline_at).getTime();
    if (Number.isNaN(time)) continue;
    if (nearest === null || time < nearest) {
      nearest = time;
      nearestIso = invite.deadline_at;
    }
  }
  return nearestIso;
}

export function mapRequestRowsToListItems(
  rows: RequestRow[],
  now: Date,
): RequestListItem[] {
  return rows
    .filter((row) => row.status !== "draft")
    .map((row) => ({
      id: row.id,
      requestCode: row.request_code,
      status: row.status,
      sentAt: row.sent_at,
      createdAt: row.created_at,
      completedAt: FINAL_REQUEST_STATUSES.has(row.status)
        ? row.sent_at ?? row.created_at
        : null,
      taskId: row.task_id,
      taskNumber: row.tasks?.bitrix_task_number ?? null,
      taskTitle: row.tasks?.title ?? row.tasks?.deal_title ?? null,
      category: row.tasks?.category ?? null,
      supplierIds: [
        ...new Set(
          (row.request_suppliers ?? [])
            .map((invite) => invite.supplier_id)
            .filter(Boolean),
        ),
      ],
      supplierCount: row.request_suppliers?.length ?? 0,
      deadline: describeDeadline(nearestDeadline(row.request_suppliers), now),
    }));
}

export const REQUEST_LIST_SELECT =
  "id, request_code, status, sent_at, created_at, task_id, tasks(bitrix_task_number, title, deal_title, category), request_suppliers!request_suppliers_request_id_fkey(status, deadline_at, supplier_id)";
