import type { DbClient } from "@/lib/db/client";
import { ensureRows } from "@/lib/db/types";

import {
  INVITE_STATUS_IN_PROGRESS,
  THREAD_ACTIVE_INVITE_STATUSES,
  insertStatusChangeEvent,
} from "@/lib/request-events-helpers";

interface InviteRow {
  id: string;
  status: string;
}

/**
 * Move active invites on a request to `in_progress`, mirroring
 * `postQuickSignal(signal_in_progress)` but optionally scoped to one invite.
 *
 * Used when procurement sets the whole request to «В работе» manually (KBN-002)
 * and can be reused from thread quick signals for a single invite.
 */
export async function applyInProgressToInvites(
  admin: DbClient,
  supabase: DbClient,
  params: {
    requestId: string;
    authorId: string;
    /** When set, only this invite is updated (quick-signal path). */
    onlyInviteId?: string;
  },
): Promise<string | null> {
  let query = supabase
    .from("request_suppliers")
    .select("id, status")
    .eq("request_id", params.requestId);

  if (params.onlyInviteId) {
    query = query.eq("id", params.onlyInviteId);
  }

  const { data, error } = await query;
  if (error) return "Не удалось загрузить приглашения.";

  const invites = ensureRows(data) as unknown as InviteRow[];
  const targets = invites.filter(
    (invite) =>
      THREAD_ACTIVE_INVITE_STATUSES.has(invite.status) &&
      invite.status !== INVITE_STATUS_IN_PROGRESS,
  );

  if (targets.length === 0) return null;

  const targetIds = targets.map((invite) => invite.id);
  const { error: updateErr } = await admin
    .from("request_suppliers")
    .update({ status: INVITE_STATUS_IN_PROGRESS })
    .in("id", targetIds);

  if (updateErr) return "Не удалось обновить статус приглашений.";

  for (const invite of targets) {
    const eventErr = await insertStatusChangeEvent(supabase, {
      requestSupplierId: invite.id,
      authorId: params.authorId,
      entity: "invite",
      oldStatus: invite.status,
      newStatus: INVITE_STATUS_IN_PROGRESS,
    });
    if (eventErr) {
      return "Не удалось записать смену статуса приглашения.";
    }
  }

  return null;
}
