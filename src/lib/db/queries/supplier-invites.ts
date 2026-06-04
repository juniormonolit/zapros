import "server-only";

import { withDbSession } from "@/lib/db/session";

export interface SupplierInviteRow {
  id: string;
  status: string;
  sent_at: string | null;
  deadline_at: string | null;
  requests: {
    request_code: string;
    status: string;
    sent_at: string | null;
    tasks: {
      bitrix_task_number: number | null;
      title: string | null;
      deal_title: string | null;
    } | null;
  } | null;
}

export async function loadSupplierInviteRows(
  userId: string,
): Promise<SupplierInviteRow[]> {
  return withDbSession(userId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      status: string;
      sent_at: string | null;
      deadline_at: string | null;
      request_code: string;
      request_status: string;
      request_sent_at: string | null;
      bitrix_task_number: number | null;
      title: string | null;
      deal_title: string | null;
    }>(`
      select
        rs.id,
        rs.status,
        rs.sent_at,
        rs.deadline_at,
        r.request_code,
        r.status as request_status,
        r.sent_at as request_sent_at,
        t.bitrix_task_number,
        t.title,
        t.deal_title
      from public.request_suppliers rs
      join public.requests r on r.id = rs.request_id
      left join public.tasks t on t.id = r.task_id
      where rs.sent_at is not null
      order by rs.deadline_at asc nulls last
    `);

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      sent_at: row.sent_at,
      deadline_at: row.deadline_at,
      requests: {
        request_code: row.request_code,
        status: row.request_status,
        sent_at: row.request_sent_at,
        tasks: {
          bitrix_task_number: row.bitrix_task_number,
          title: row.title,
          deal_title: row.deal_title,
        },
      },
    }));
  });
}
