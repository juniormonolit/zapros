import type { DbClient } from "@/lib/db/client";
import { ensureRow, ensureRows } from "@/lib/db/types";

import type {
  RequestEventType,
  StatusChangePayload,
} from "@/lib/request-events-types";
import {
  REQUEST_EVENT_STATUS_CHANGE,
} from "@/lib/request-events-types";

/** Invite statuses that allow thread writes (mirrors `invite_allows_thread_write`). */
export const THREAD_ACTIVE_INVITE_STATUSES = new Set([
  "new",
  "answered",
  "under_review",
  "clarification",
  "in_progress",
]);

export const BLOCKED_REQUEST_STATUSES = new Set(["draft", "cancelled"]);

/** Request statuses that must not be overwritten by aggregation. */
export const FINAL_REQUEST_STATUSES = new Set([
  "won",
  "lost",
  "cancelled",
  "no_response",
]);

export const INVITE_STATUS_CLARIFICATION = "clarification" as const;
export const INVITE_STATUS_IN_PROGRESS = "in_progress" as const;
export const INVITE_STATUS_ANSWERED = "answered" as const;

export const REQUEST_STATUS_CLARIFICATION = "clarification" as const;
export const REQUEST_STATUS_IN_PROGRESS = "in_progress" as const;
export const REQUEST_STATUS_HAS_RESPONSE = "has_response" as const;
export const REQUEST_STATUS_AWAITING = "awaiting_responses" as const;

export interface InviteEventContext {
  id: string;
  supplierId: string;
  status: string;
  firstResponseAt: string | null;
  timerPausedAt: string | null;
  deadlineAt: string | null;
  requestId: string;
  requestStatus: string;
}

export function failEvent(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export async function loadInviteEventContext(
  supabase: DbClient,
  requestSupplierId: string,
): Promise<InviteEventContext | null> {
  const { data, error } = await supabase
    .from("request_suppliers")
    .select(
      "id, supplier_id, status, first_response_at, timer_paused_at, deadline_at, request_id",
    )
    .eq("id", requestSupplierId)
    .maybeSingle();

  const invite = ensureRow(data);
  if (error || !invite) return null;

  const { data: requestData, error: requestError } = await supabase
    .from("requests")
    .select("status")
    .eq("id", String(invite.request_id))
    .maybeSingle();

  const request = ensureRow(requestData);
  if (requestError || !request) return null;

  return {
    id: String(invite.id),
    supplierId: String(invite.supplier_id),
    status: String(invite.status),
    firstResponseAt: (invite.first_response_at as string | null) ?? null,
    timerPausedAt: (invite.timer_paused_at as string | null) ?? null,
    deadlineAt: (invite.deadline_at as string | null) ?? null,
    requestId: String(invite.request_id),
    requestStatus: String(request.status),
  };
}

export function validateThreadAccess(
  invite: InviteEventContext,
): string | null {
  if (BLOCKED_REQUEST_STATUSES.has(invite.requestStatus)) {
    return "Запрос недоступен для переписки.";
  }
  if (!THREAD_ACTIVE_INVITE_STATUSES.has(invite.status)) {
    return "На этом приглашении переписка закрыта.";
  }
  return null;
}

export async function insertRequestEvent(
  supabase: DbClient,
  params: {
    requestSupplierId: string;
    authorId: string;
    eventType: RequestEventType;
    body?: string | null;
    payload?: Record<string, unknown> | StatusChangePayload | null;
  },
): Promise<boolean> {
  const { error } = await supabase.from("request_events").insert({
    request_supplier_id: params.requestSupplierId,
    author_id: params.authorId,
    event_type: params.eventType,
    body: params.body ?? null,
    payload: params.payload ?? null,
  });
  return Boolean(error);
}

export async function insertStatusChangeEvent(
  supabase: DbClient,
  params: {
    requestSupplierId: string;
    authorId: string;
    entity: StatusChangePayload["entity"];
    oldStatus: string;
    newStatus: string;
  },
): Promise<boolean> {
  const payload: StatusChangePayload = {
    entity: params.entity,
    oldStatus: params.oldStatus,
    newStatus: params.newStatus,
  };
  return insertRequestEvent(supabase, {
    requestSupplierId: params.requestSupplierId,
    authorId: params.authorId,
    eventType: REQUEST_EVENT_STATUS_CHANGE,
    payload,
  });
}

/**
 * Derive aggregate `requests.status` from invite rows (status-machines.md priority).
 */
export function aggregateRequestStatus(
  inviteStatuses: readonly string[],
  currentRequestStatus: string,
): string | null {
  if (FINAL_REQUEST_STATUSES.has(currentRequestStatus)) {
    return null;
  }

  if (inviteStatuses.some((s) => s === INVITE_STATUS_IN_PROGRESS)) {
    return REQUEST_STATUS_IN_PROGRESS;
  }
  if (inviteStatuses.some((s) => s === INVITE_STATUS_CLARIFICATION)) {
    return REQUEST_STATUS_CLARIFICATION;
  }
  if (
    inviteStatuses.some((s) => s === "answered" || s === "under_review")
  ) {
    return REQUEST_STATUS_HAS_RESPONSE;
  }
  if (
    inviteStatuses.length > 0 &&
    inviteStatuses.every((s) => s === "no_response")
  ) {
    return "no_response";
  }
  if (inviteStatuses.some((s) => s === "new")) {
    return REQUEST_STATUS_AWAITING;
  }

  return REQUEST_STATUS_HAS_RESPONSE;
}

export async function loadInviteStatusesForRequest(
  supabase: DbClient,
  requestId: string,
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("request_suppliers")
    .select("status")
    .eq("request_id", requestId);
  if (error) return null;
  return ensureRows(data).map((row) => String(row.status));
}

export async function syncRequestStatusFromInvites(
  admin: DbClient,
  supabase: DbClient,
  params: {
    requestId: string;
    currentRequestStatus: string;
    requestSupplierId: string;
    authorId: string;
  },
): Promise<boolean> {
  const statuses = await loadInviteStatusesForRequest(supabase, params.requestId);
  if (statuses === null) return true;

  const nextStatus = aggregateRequestStatus(statuses, params.currentRequestStatus);
  if (!nextStatus || nextStatus === params.currentRequestStatus) {
    return false;
  }

  const { error } = await admin
    .from("requests")
    .update({ status: nextStatus })
    .eq("id", params.requestId)
    .in("status", [
      "new",
      REQUEST_STATUS_AWAITING,
      REQUEST_STATUS_HAS_RESPONSE,
      REQUEST_STATUS_CLARIFICATION,
      REQUEST_STATUS_IN_PROGRESS,
    ]);

  if (error) return true;

  return insertStatusChangeEvent(supabase, {
    requestSupplierId: params.requestSupplierId,
    authorId: params.authorId,
    entity: "request",
    oldStatus: params.currentRequestStatus,
    newStatus: nextStatus,
  });
}
