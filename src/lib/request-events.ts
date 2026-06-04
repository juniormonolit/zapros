import "server-only";

import {
  formatEventAuthorName,
  type ThreadEvent,
} from "@/lib/request-events-display";
import type { RequestEventType } from "@/lib/request-events-types";
import { getUser } from "@/lib/auth";
import type { DbClient } from "@/lib/db/client";
import { withDbSession } from "@/lib/db/session";

export type { ThreadEvent } from "@/lib/request-events-display";

function mapEventRow(row: {
  id: string;
  request_supplier_id: string;
  event_type: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  author_id: string;
  full_name: string | null;
  role: string | null;
}): ThreadEvent {
  return {
    id: row.id,
    requestSupplierId: row.request_supplier_id,
    eventType: row.event_type as RequestEventType,
    body: row.body,
    payload: row.payload,
    createdAt: row.created_at,
    authorId: row.author_id,
    authorName: formatEventAuthorName(row.full_name, row.role),
    authorRole: row.role ?? "",
  };
}

async function loadEventsSql(
  userId: string | undefined,
  inviteIds: string[] | null,
  singleInviteId: string | null,
  limit: number,
): Promise<ThreadEvent[]> {
  return withDbSession(userId, async (client) => {
    const params: unknown[] = [];
    let where = "";

    if (singleInviteId) {
      params.push(singleInviteId);
      where = `where e.request_supplier_id = $${params.length}`;
    } else if (inviteIds && inviteIds.length > 0) {
      params.push(inviteIds);
      where = `where e.request_supplier_id = any($${params.length}::uuid[])`;
    } else {
      return [];
    }

    params.push(limit);
    const limitParam = `$${params.length}`;

    const { rows } = await client.query<{
      id: string;
      request_supplier_id: string;
      event_type: string;
      body: string | null;
      payload: Record<string, unknown> | null;
      created_at: string;
      author_id: string;
      full_name: string | null;
      role: string | null;
    }>(
      `
      select
        e.id,
        e.request_supplier_id,
        e.event_type,
        e.body,
        e.payload,
        e.created_at,
        e.author_id,
        p.full_name,
        p.role::text as role
      from public.request_events e
      left join public.profiles p on p.id = e.author_id
      ${where}
      order by e.created_at asc
      limit ${limitParam}
      `,
      params,
    );

    return rows.map(mapEventRow);
  });
}

/**
 * Load chronological thread events for one invite (oldest first).
 */
export async function loadThreadEvents(
  _client: DbClient,
  requestSupplierId: string,
  limit = 200,
): Promise<ThreadEvent[]> {
  const user = await getUser();
  return loadEventsSql(user?.id, null, requestSupplierId, limit);
}

/**
 * Batch-load thread events for multiple invites; grouped by invite id.
 */
export async function loadThreadEventsByInviteIds(
  _client: DbClient,
  inviteIds: readonly string[],
  limit = 500,
): Promise<Map<string, ThreadEvent[]>> {
  const user = await getUser();
  const result = new Map<string, ThreadEvent[]>();
  if (inviteIds.length === 0) return result;

  for (const id of inviteIds) {
    result.set(id, []);
  }

  const events = await loadEventsSql(user?.id, [...inviteIds], null, limit);
  for (const mapped of events) {
    const list = result.get(mapped.requestSupplierId);
    if (list) list.push(mapped);
  }

  return result;
}
