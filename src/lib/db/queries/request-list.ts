import "server-only";

import type { RequestRow } from "@/lib/requests-list-data";
import { withDbSession } from "@/lib/db/session";

export async function loadRequestListRows(
  userId: string,
): Promise<RequestRow[]> {
  return withDbSession(userId, async (client) => {
    const { rows: requests } = await client.query<{
      id: string;
      request_code: string;
      status: string;
      sent_at: string | null;
      created_at: string | null;
      task_id: string;
      bitrix_task_number: number | null;
      title: string | null;
      deal_title: string | null;
      category: string | null;
    }>(`
      select
        r.id,
        r.request_code,
        r.status,
        r.sent_at,
        r.created_at,
        r.task_id,
        t.bitrix_task_number,
        t.title,
        t.deal_title,
        t.category
      from public.requests r
      left join public.tasks t on t.id = r.task_id
      order by r.created_at desc
    `);

    if (requests.length === 0) return [];

    const ids = requests.map((r) => r.id);
    const { rows: invites } = await client.query<{
      request_id: string;
      status: string;
      deadline_at: string | null;
      supplier_id: string;
    }>(
      `
      select request_id, status, deadline_at, supplier_id
      from public.request_suppliers
      where request_id = any($1::uuid[])
      `,
      [ids],
    );

    const invitesByRequest = new Map<string, RequestRow["request_suppliers"]>();
    for (const inv of invites) {
      const list = invitesByRequest.get(inv.request_id) ?? [];
      list.push({
        status: inv.status,
        deadline_at: inv.deadline_at,
        supplier_id: inv.supplier_id,
      });
      invitesByRequest.set(inv.request_id, list);
    }

    return requests.map((r) => ({
      id: r.id,
      request_code: r.request_code,
      status: r.status,
      sent_at: r.sent_at,
      created_at: r.created_at,
      task_id: r.task_id,
      tasks: {
        bitrix_task_number: r.bitrix_task_number,
        title: r.title,
        deal_title: r.deal_title,
        category: r.category,
      },
      request_suppliers: invitesByRequest.get(r.id) ?? [],
    }));
  });
}
