import { SupplierView } from "@/components/supplier/supplier-view";
import type { SupplierRequestListItem } from "@/components/supplier/supplier-request-list";
import { getUser } from "@/lib/auth";
import { loadSupplierInviteRows } from "@/lib/db/queries/supplier-invites";
import { describeDeadline } from "@/lib/request-status";

interface RequestTaskJoin {
  bitrix_task_number: number | null;
  title: string | null;
  deal_title: string | null;
}

interface RequestJoin {
  request_code: string;
  status: string;
  sent_at: string | null;
  tasks: RequestTaskJoin | null;
}

interface InviteRow {
  id: string;
  status: string;
  sent_at: string | null;
  deadline_at: string | null;
  requests: RequestJoin | null;
}

const HIDDEN_REQUEST_STATUSES = new Set(["draft", "cancelled"]);

function isSentInvite(row: InviteRow): boolean {
  const request = row.requests;
  if (!request) return false;
  if (HIDDEN_REQUEST_STATUSES.has(request.status)) return false;
  if (request.sent_at == null) return false;
  return row.sent_at != null;
}

function mapRowToItem(row: InviteRow, now: Date): SupplierRequestListItem | null {
  const request = row.requests;
  if (!request) return null;

  return {
    inviteId: row.id,
    requestCode: request.request_code,
    taskNumber: request.tasks?.bitrix_task_number ?? null,
    taskTitle: request.tasks?.title ?? request.tasks?.deal_title ?? null,
    inviteStatus: row.status,
    sentAt: row.sent_at ?? request.sent_at,
    deadline: describeDeadline(row.deadline_at, now),
  };
}

/**
 * Supplier home (`/supplier`): kanban (default) or list of invites (RLS-scoped).
 */
export default async function SupplierRequestsPage() {
  const user = await getUser();
  if (!user) return null;

  const rows = (await loadSupplierInviteRows(user.id)).filter(isSentInvite);
  const now = new Date();

  const items: SupplierRequestListItem[] = [];
  for (const row of rows) {
    const item = mapRowToItem(row, now);
    if (item) items.push(item);
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-text-primary">Мои запросы</h1>
      </header>

      <SupplierView items={items} />
    </div>
  );
}
