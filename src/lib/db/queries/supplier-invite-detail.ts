import "server-only";

import type { PaymentForm } from "@/lib/parser/bitrix";
import { withDbSession } from "@/lib/db/session";

export interface SupplierInviteDetail {
  id: string;
  status: string;
  sent_at: string | null;
  deadline_at: string | null;
  timer_paused_at: string | null;
  requests: {
    id: string;
    request_code: string;
    status: string;
    payment_form: PaymentForm | null;
    needs_delivery: boolean;
    sent_at: string | null;
    tasks: {
      bitrix_task_number: number | null;
      title: string | null;
      deal_title: string | null;
    } | null;
  };
}

export async function loadSupplierInviteDetail(
  userId: string,
  inviteId: string,
): Promise<SupplierInviteDetail | null> {
  return withDbSession(userId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      status: string;
      sent_at: string | null;
      deadline_at: string | null;
      timer_paused_at: string | null;
      request_id: string;
      request_code: string;
      request_status: string;
      payment_form: PaymentForm | null;
      needs_delivery: boolean;
      request_sent_at: string | null;
      bitrix_task_number: number | null;
      title: string | null;
      deal_title: string | null;
    }>(
      `
      select
        rs.id,
        rs.status,
        rs.sent_at,
        rs.deadline_at,
        rs.timer_paused_at,
        r.id as request_id,
        r.request_code,
        r.status as request_status,
        r.payment_form,
        r.needs_delivery,
        r.sent_at as request_sent_at,
        t.bitrix_task_number,
        t.title,
        t.deal_title
      from public.request_suppliers rs
      join public.requests r on r.id = rs.request_id
      left join public.tasks t on t.id = r.task_id
      where rs.id = $1
      `,
      [inviteId],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      status: row.status,
      sent_at: row.sent_at,
      deadline_at: row.deadline_at,
      timer_paused_at: row.timer_paused_at,
      requests: {
        id: row.request_id,
        request_code: row.request_code,
        status: row.request_status,
        payment_form: row.payment_form,
        needs_delivery: row.needs_delivery,
        sent_at: row.request_sent_at,
        tasks: {
          bitrix_task_number: row.bitrix_task_number,
          title: row.title,
          deal_title: row.deal_title,
        },
      },
    };
  });
}
