import type { DbClient } from "@/lib/db/client";
import { ensureRows } from "@/lib/db/types";

import {
  insertRequestEvent,
  insertStatusChangeEvent,
} from "@/lib/request-events-helpers";
import { REQUEST_EVENT_STATUS_CHANGE } from "@/lib/request-events-types";
import type {
  DuplicateCancelEventPayload,
  FinalizationInviteRow,
  RejectReason,
} from "@/lib/request-finalization-types";
import {
  FINALIZED_REQUEST_STATUSES,
  FINAL_INVITE_STATUSES,
  INVITE_STATUSES_WITH_RESPONSE,
  MANUAL_REJECT_REASONS,
  OPEN_REQUEST_STATUSES_FOR_DUPLICATES,
  REJECT_REASONS,
} from "@/lib/request-finalization-types";

export {
  FINALIZED_REQUEST_STATUSES,
  MANUAL_REJECT_REASONS,
  OPEN_REQUEST_STATUSES_FOR_DUPLICATES,
} from "@/lib/request-finalization-types";
export type { RejectReason } from "@/lib/request-finalization-types";

const REJECT_REASON_SET = new Set<string>(REJECT_REASONS);

/** Whether a request status allows win/reject finalization. */
export function canFinalizeRequest(status: string): boolean {
  return status !== "draft" && !FINALIZED_REQUEST_STATUSES.has(status);
}

/** Whether an invite has submitted at least one response version. */
export function inviteHasResponse(invite: FinalizationInviteRow): boolean {
  if (invite.firstResponseAt) return true;
  return INVITE_STATUSES_WITH_RESPONSE.has(invite.status);
}

/**
 * Validate a manually chosen reject reason (selectWinner / rejectRequest).
 * Returns a user-facing error or `null` when valid.
 */
export function validateManualRejectReason(
  reason: string,
  comment?: string | null,
): string | null {
  if (!REJECT_REASON_SET.has(reason)) {
    return "Укажите корректную причину отказа.";
  }
  if (!MANUAL_REJECT_REASONS.has(reason as RejectReason)) {
    return "Эту причину нельзя выбрать вручную.";
  }
  if (reason === "other") {
    const trimmed = comment?.trim() ?? "";
    if (trimmed.length === 0) {
      return "Укажите комментарий для причины «Другое».";
    }
  }
  return null;
}

/**
 * Pure: request ids (other than the winner) that share task items and are still open.
 */
export function findOpenDuplicateRequestIds(
  winningRequestId: string,
  rows: readonly { requestId: string; status: string }[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of rows) {
    if (row.requestId === winningRequestId) continue;
    if (!OPEN_REQUEST_STATUSES_FOR_DUPLICATES.has(row.status)) continue;
    if (seen.has(row.requestId)) continue;
    seen.add(row.requestId);
    result.push(row.requestId);
  }
  return result;
}

/** Set `task_items.line_status = closed` for positions in the winning request. */
export async function closeRequestLineItems(
  admin: DbClient,
  taskItemIds: readonly string[],
): Promise<string | null> {
  if (taskItemIds.length === 0) return null;

  const { error } = await admin
    .from("task_items")
    .update({ line_status: "closed" })
    .in("id", [...taskItemIds]);

  if (error) {
    return "Не удалось закрыть позиции задачи.";
  }
  return null;
}

/** Set `task_items.line_status = rejected` for positions in a rejected request. */
export async function rejectTaskItemsForLoss(
  admin: DbClient,
  taskItemIds: readonly string[],
): Promise<string | null> {
  if (taskItemIds.length === 0) return null;

  const { error } = await admin
    .from("task_items")
    .update({ line_status: "rejected" })
    .in("id", [...taskItemIds]);

  if (error) {
    return "Не удалось отметить позиции как брак.";
  }
  return null;
}

export interface CancelDuplicateOpenRequestsParams {
  admin: DbClient;
  eventsClient: DbClient;
  winningRequestId: string;
  taskId: string;
  taskItemIds: readonly string[];
  authorId: string;
}

/**
 * Cancel other open requests that share any of the winning request's task items.
 * Whole duplicate requests are cancelled even if they contain extra positions (MVP).
 */
export async function cancelDuplicateOpenRequests(
  params: CancelDuplicateOpenRequestsParams,
): Promise<string | null> {
  const { admin, eventsClient, winningRequestId, taskId, taskItemIds, authorId } =
    params;

  if (taskItemIds.length === 0) return null;

  const { data: itemRows, error: itemsError } = await admin
    .from("request_items")
    .select("request_id")
    .in("task_item_id", [...taskItemIds]);

  if (itemsError) {
    return "Не удалось найти дублирующие запросы.";
  }

  const relatedRequestIds = [
    ...new Set(
      ensureRows(itemRows)
        .map((row) => String(row.request_id))
        .filter((id) => id !== winningRequestId),
    ),
  ];

  if (relatedRequestIds.length === 0) return null;

  const { data: requestRows, error: requestsError } = await admin
    .from("requests")
    .select("id, status")
    .eq("task_id", taskId)
    .in("id", relatedRequestIds);

  if (requestsError) {
    return "Не удалось найти дублирующие запросы.";
  }

  const candidateRows = ensureRows(requestRows).map((row) => ({
    requestId: String(row.id),
    status: String(row.status),
  }));

  const duplicateIds = findOpenDuplicateRequestIds(winningRequestId, candidateRows);
  if (duplicateIds.length === 0) return null;

  const nowIso = new Date().toISOString();

  for (const duplicateId of duplicateIds) {
    const { error: requestErr } = await admin
      .from("requests")
      .update({
        status: "cancelled",
        outcome: "cancelled",
        reject_reason: "other_supplier_selected",
        completed_at: nowIso,
      })
      .eq("id", duplicateId)
      .in("status", [...OPEN_REQUEST_STATUSES_FOR_DUPLICATES]);

    if (requestErr) {
      return "Не удалось отменить дублирующий запрос.";
    }

    const { data: invites, error: invitesError } = await admin
      .from("request_suppliers")
      .select("id, status")
      .eq("request_id", duplicateId);

    if (invitesError) {
      return "Не удалось обновить приглашения дублирующего запроса.";
    }

    const inviteRows = ensureRows(invites);
    const activeInviteIds = inviteRows
      .filter((row) => !FINAL_INVITE_STATUSES.has(String(row.status)))
      .map((row) => String(row.id));

    if (activeInviteIds.length > 0) {
      const { error: inviteUpdateErr } = await admin
        .from("request_suppliers")
        .update({ status: "lost" })
        .in("id", activeInviteIds);

      if (inviteUpdateErr) {
        return "Не удалось закрыть приглашения дублирующего запроса.";
      }
    }

    const anchorInviteId = inviteRows[0] ? String(inviteRows[0].id) : undefined;
    const oldRequestStatus =
      candidateRows.find((r) => r.requestId === duplicateId)?.status ?? "unknown";

    if (anchorInviteId) {
      const eventErr = await insertDuplicateCancelEvent(eventsClient, {
        requestSupplierId: anchorInviteId,
        authorId,
        winningRequestId,
        oldRequestStatus,
      });
      if (eventErr) {
        return "Не удалось записать событие автозакрытия дубля.";
      }

      for (const invite of inviteRows) {
        const oldStatus = String(invite.status);
        if (FINAL_INVITE_STATUSES.has(oldStatus) || oldStatus === "lost") continue;
        const inviteEventErr = await insertStatusChangeEvent(eventsClient, {
          requestSupplierId: String(invite.id),
          authorId,
          entity: "invite",
          oldStatus,
          newStatus: "lost",
        });
        if (inviteEventErr) {
          return "Не удалось записать смену статуса приглашения дубля.";
        }
      }
    }
  }

  return null;
}

export interface FinalizationEventInviteChange {
  requestSupplierId: string;
  oldStatus: string;
  newStatus: string;
}

export interface InsertFinalizationEventsParams {
  eventsClient: DbClient;
  authorId: string;
  anchorInviteId: string;
  requestOldStatus: string;
  requestNewStatus: string;
  inviteChanges: readonly FinalizationEventInviteChange[];
}

/** Batch `status_change` events for request finalization (win or reject). */
export async function insertFinalizationEvents(
  params: InsertFinalizationEventsParams,
): Promise<string | null> {
  const {
    eventsClient,
    authorId,
    anchorInviteId,
    requestOldStatus,
    requestNewStatus,
    inviteChanges,
  } = params;

  for (const change of inviteChanges) {
    if (change.oldStatus === change.newStatus) continue;
    const inviteErr = await insertStatusChangeEvent(eventsClient, {
      requestSupplierId: change.requestSupplierId,
      authorId,
      entity: "invite",
      oldStatus: change.oldStatus,
      newStatus: change.newStatus,
    });
    if (inviteErr) {
      return "Не удалось записать смену статуса приглашения.";
    }
  }

  if (requestOldStatus !== requestNewStatus) {
    const requestErr = await insertStatusChangeEvent(eventsClient, {
      requestSupplierId: anchorInviteId,
      authorId,
      entity: "request",
      oldStatus: requestOldStatus,
      newStatus: requestNewStatus,
    });
    if (requestErr) {
      return "Не удалось записать смену статуса запроса.";
    }
  }

  return null;
}

async function insertDuplicateCancelEvent(
  supabase: DbClient,
  params: {
    requestSupplierId: string;
    authorId: string;
    winningRequestId: string;
    oldRequestStatus: string;
  },
): Promise<boolean> {
  const payload: DuplicateCancelEventPayload = {
    kind: "duplicate_cancelled",
    winningRequestId: params.winningRequestId,
  };

  const statusInserted = await insertRequestEvent(supabase, {
    requestSupplierId: params.requestSupplierId,
    authorId: params.authorId,
    eventType: REQUEST_EVENT_STATUS_CHANGE,
    payload: {
      entity: "request",
      oldStatus: params.oldRequestStatus,
      newStatus: "cancelled",
      ...payload,
    },
  });

  return statusInserted;
}
