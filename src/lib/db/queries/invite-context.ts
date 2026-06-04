import "server-only";

import type { PaymentForm } from "@/lib/parser/bitrix";
import { withDbSession } from "@/lib/db/session";

export interface InviteContextRow {
  invite: {
    id: string;
    supplierId: string;
    status: string;
    firstResponseAt: string | null;
    deadlineAt: string | null;
    timerPausedAt: string | null;
    requestId: string;
  };
  request: {
    id: string;
    status: string;
    paymentForm: PaymentForm | null;
    needsDelivery: boolean;
    sentAt: string | null;
  };
}

export async function loadInviteContext(
  userId: string,
  requestSupplierId: string,
): Promise<InviteContextRow | null> {
  return withDbSession(userId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      supplier_id: string;
      status: string;
      first_response_at: string | null;
      deadline_at: string | null;
      timer_paused_at: string | null;
      request_id: string;
      request_status: string;
      payment_form: PaymentForm | null;
      needs_delivery: boolean;
      request_sent_at: string | null;
    }>(
      `
      select
        rs.id,
        rs.supplier_id,
        rs.status,
        rs.first_response_at,
        rs.deadline_at,
        rs.timer_paused_at,
        rs.request_id,
        r.status as request_status,
        r.payment_form,
        r.needs_delivery,
        r.sent_at as request_sent_at
      from public.request_suppliers rs
      join public.requests r on r.id = rs.request_id
      where rs.id = $1
      `,
      [requestSupplierId],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      invite: {
        id: row.id,
        supplierId: row.supplier_id,
        status: row.status,
        firstResponseAt: row.first_response_at,
        deadlineAt: row.deadline_at,
        timerPausedAt: row.timer_paused_at,
        requestId: row.request_id,
      },
      request: {
        id: row.request_id,
        status: row.request_status,
        paymentForm: row.payment_form,
        needsDelivery: row.needs_delivery,
        sentAt: row.request_sent_at,
      },
    };
  });
}
