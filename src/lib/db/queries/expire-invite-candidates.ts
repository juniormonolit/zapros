import "server-only";

import type { ExpireInviteCandidate } from "@/lib/expire-invites";
import { EXPIRABLE_INVITE_STATUSES } from "@/lib/expire-invites";
import { withDbSession } from "@/lib/db/session";

/** Admin cron: overdue invites with parent request metadata (no RLS user). */
export async function loadExpireInviteCandidates(
  now: Date,
): Promise<ExpireInviteCandidate[]> {
  return withDbSession(undefined, async (client) => {
    const { rows } = await client.query<{
      id: string;
      request_id: string;
      status: string;
      deadline_at: string | null;
      timer_paused_at: string | null;
      first_response_at: string | null;
      request_status: string;
      request_created_by: string;
    }>(
      `
      select
        rs.id,
        rs.request_id,
        rs.status,
        rs.deadline_at,
        rs.timer_paused_at,
        rs.first_response_at,
        r.status as request_status,
        r.created_by as request_created_by
      from public.request_suppliers rs
      join public.requests r on r.id = rs.request_id
      where rs.deadline_at < $1
        and rs.timer_paused_at is null
        and rs.status = any($2::text[])
      `,
      [now.toISOString(), [...EXPIRABLE_INVITE_STATUSES]],
    );

    return rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      status: row.status,
      deadlineAt: row.deadline_at,
      timerPausedAt: row.timer_paused_at,
      firstResponseAt: row.first_response_at,
      requestStatus: row.request_status,
      requestCreatedBy: row.request_created_by,
    }));
  });
}
