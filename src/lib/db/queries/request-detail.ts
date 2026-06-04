import "server-only";

import type { PaymentForm } from "@/lib/parser/bitrix";
import { withDbSession } from "@/lib/db/session";

export interface RequestDetailRecord {
  id: string;
  request_code: string;
  status: string;
  payment_form: PaymentForm | null;
  needs_delivery: boolean;
  comment: string | null;
  sent_at: string | null;
  task_id: string;
  tasks: {
    bitrix_task_number: number | null;
    title: string | null;
    deal_title: string | null;
  } | null;
}

export interface RequestSupplierWithName {
  id: string;
  supplier_id: string;
  status: string;
  sent_at: string | null;
  deadline_at: string | null;
  timer_paused_at: string | null;
  first_response_at: string | null;
  suppliers: { name: string } | null;
}

export async function loadRequestDetail(
  userId: string,
  requestId: string,
): Promise<RequestDetailRecord | null> {
  return withDbSession(userId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      request_code: string;
      status: string;
      payment_form: PaymentForm | null;
      needs_delivery: boolean;
      comment: string | null;
      sent_at: string | null;
      task_id: string;
      bitrix_task_number: number | null;
      title: string | null;
      deal_title: string | null;
    }>(
      `
      select
        r.id,
        r.request_code,
        r.status,
        r.payment_form,
        r.needs_delivery,
        r.comment,
        r.sent_at,
        r.task_id,
        t.bitrix_task_number,
        t.title,
        t.deal_title
      from public.requests r
      left join public.tasks t on t.id = r.task_id
      where r.id = $1
      `,
      [requestId],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      request_code: row.request_code,
      status: row.status,
      payment_form: row.payment_form,
      needs_delivery: row.needs_delivery,
      comment: row.comment,
      sent_at: row.sent_at,
      task_id: row.task_id,
      tasks: {
        bitrix_task_number: row.bitrix_task_number,
        title: row.title,
        deal_title: row.deal_title,
      },
    };
  });
}

export async function loadRequestSuppliersWithNames(
  userId: string,
  requestId: string,
): Promise<RequestSupplierWithName[]> {
  return withDbSession(userId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      supplier_id: string;
      status: string;
      sent_at: string | null;
      deadline_at: string | null;
      timer_paused_at: string | null;
      first_response_at: string | null;
      supplier_name: string | null;
    }>(
      `
      select
        rs.id,
        rs.supplier_id,
        rs.status,
        rs.sent_at,
        rs.deadline_at,
        rs.timer_paused_at,
        rs.first_response_at,
        s.name as supplier_name
      from public.request_suppliers rs
      left join public.suppliers s on s.id = rs.supplier_id
      where rs.request_id = $1
      order by rs.created_at asc
      `,
      [requestId],
    );

    return rows.map((row) => ({
      id: row.id,
      supplier_id: row.supplier_id,
      status: row.status,
      sent_at: row.sent_at,
      deadline_at: row.deadline_at,
      timer_paused_at: row.timer_paused_at,
      first_response_at: row.first_response_at,
      suppliers: row.supplier_name ? { name: row.supplier_name } : null,
    }));
  });
}
