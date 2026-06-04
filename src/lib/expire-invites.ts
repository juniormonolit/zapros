import type { DbClient } from "@/lib/db/client";
import { loadExpireInviteCandidates } from "@/lib/db/queries/expire-invite-candidates";
import { ensureRow, ensureRows } from "@/lib/db/types";

import { isOverdue } from "@/lib/deadline";
import {
  FINAL_REQUEST_STATUSES,
  REQUEST_STATUS_AWAITING,
  REQUEST_STATUS_CLARIFICATION,
  REQUEST_STATUS_HAS_RESPONSE,
  REQUEST_STATUS_IN_PROGRESS,
  insertStatusChangeEvent,
} from "@/lib/request-events-helpers";

/** Active invite statuses eligible for timer expiry (non-final, timer may run). */
export const EXPIRABLE_INVITE_STATUSES = [
  "new",
  "answered",
  "under_review",
  "clarification",
  "in_progress",
] as const;

export type ExpirableInviteStatus = (typeof EXPIRABLE_INVITE_STATUSES)[number];

/** Request statuses that cron may overwrite when all invites expire without answers. */
const OPEN_REQUEST_STATUSES_FOR_EXPIRE = [
  "new",
  REQUEST_STATUS_AWAITING,
  REQUEST_STATUS_HAS_RESPONSE,
  REQUEST_STATUS_CLARIFICATION,
  REQUEST_STATUS_IN_PROGRESS,
] as const;

export interface ExpireInviteRow {
  id: string;
  status: string;
  deadlineAt: Date | string | null;
  timerPausedAt: Date | string | null;
}

export interface ExpireInviteCandidate extends ExpireInviteRow {
  requestId: string;
  firstResponseAt: string | null;
  requestStatus: string;
  requestCreatedBy: string;
}

export interface RunExpireInvitesOptions {
  /** Defaults to each request's `created_by` when omitted. */
  authorId?: string;
}

export interface RunExpireInvitesResult {
  expiredInviteCount: number;
  updatedRequestCount: number;
  errors: string[];
}

function toDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Whether an invite should transition to `no_response` at `now`.
 *
 * Per F007 only invites still awaiting a first response expire (`new`). Paused
 * timers (`timer_paused_at` set) and final invite statuses never expire.
 */
export function shouldExpireInvite(
  status: string,
  deadlineAt: Date | string | null,
  timerPausedAt: Date | string | null,
  now: Date,
): boolean {
  if (!EXPIRABLE_INVITE_STATUSES.includes(status as ExpirableInviteStatus)) {
    return false;
  }
  if (status !== "new") {
    return false;
  }
  if (timerPausedAt != null) {
    return false;
  }
  const deadline = toDate(deadlineAt);
  if (deadline == null) {
    return false;
  }
  return isOverdue(deadline, now);
}

/** Pure: ids of invites that should become `no_response` at `now`. */
export function computeExpiredInviteUpdates(
  invites: readonly ExpireInviteRow[],
  now: Date,
): string[] {
  return invites
    .filter((invite) =>
      shouldExpireInvite(
        invite.status,
        invite.deadlineAt,
        invite.timerPausedAt,
        now,
      ),
    )
    .map((invite) => invite.id);
}

/**
 * Pure: when every invite is `no_response` and nobody answered, archive the request.
 */
export function aggregateRequestAfterExpire(
  inviteStatuses: readonly string[],
  hasAnyResponse: boolean,
): "no_response" | null {
  if (hasAnyResponse) return null;
  if (inviteStatuses.length === 0) return null;
  if (inviteStatuses.every((status) => status === "no_response")) {
    return "no_response";
  }
  return null;
}

/**
 * Expire overdue invites and archive empty requests (F007 cron).
 */
export async function runExpireInvites(
  admin: DbClient,
  now: Date,
  options: RunExpireInvitesOptions = {},
): Promise<RunExpireInvitesResult> {
  const result: RunExpireInvitesResult = {
    expiredInviteCount: 0,
    updatedRequestCount: 0,
    errors: [],
  };

  let candidates: ExpireInviteCandidate[];
  try {
    candidates = await loadExpireInviteCandidates(now);
  } catch (err) {
    result.errors.push(
      err instanceof Error ? err.message : "Failed to load expire candidates",
    );
    return result;
  }

  const toExpire = candidates.filter((invite) =>
    shouldExpireInvite(
      invite.status,
      invite.deadlineAt,
      invite.timerPausedAt,
      now,
    ),
  );

  const affectedRequestIds = new Set<string>();

  for (const invite of toExpire) {
    const { data: updatedRows, error: updateErr } = await admin
      .from("request_suppliers")
      .update({ status: "no_response" })
      .eq("id", invite.id)
      .eq("status", invite.status)
      .select("id");

    if (updateErr) {
      result.errors.push(updateErr.message);
      continue;
    }
    if (!updatedRows?.length) continue;

    result.expiredInviteCount += 1;
    affectedRequestIds.add(invite.requestId);

    const authorId = options.authorId ?? invite.requestCreatedBy;
    const eventErr = await insertStatusChangeEvent(admin, {
      requestSupplierId: invite.id,
      authorId,
      entity: "invite",
      oldStatus: invite.status,
      newStatus: "no_response",
    });
    if (eventErr) {
      result.errors.push(`event:${invite.id}`);
    }
  }

  for (const requestId of affectedRequestIds) {
    const updated = await syncRequestAfterInviteExpire(admin, requestId, now, options);
    if (updated) {
      result.updatedRequestCount += 1;
    }
  }

  return result;
}

async function syncRequestAfterInviteExpire(
  admin: DbClient,
  requestId: string,
  now: Date,
  options: RunExpireInvitesOptions,
): Promise<boolean> {
  const { data: requestData, error: requestErr } = await admin
    .from("requests")
    .select("id, status, created_by")
    .eq("id", requestId)
    .maybeSingle();

  const requestRow = ensureRow(requestData);
  if (requestErr || !requestRow) return false;

  const currentStatus = String(requestRow.status);
  if (FINAL_REQUEST_STATUSES.has(currentStatus)) {
    return false;
  }

  const { data: inviteRowsData, error: invitesErr } = await admin
    .from("request_suppliers")
    .select("id, status, first_response_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (invitesErr) return false;

  const inviteRows = ensureRows(inviteRowsData);
  if (inviteRows.length === 0) return false;

  const statuses = inviteRows.map((row) => String(row.status));
  const hasAnyResponse = inviteRows.some(
    (row) => row.first_response_at != null,
  );

  const nextStatus = aggregateRequestAfterExpire(statuses, hasAnyResponse);
  if (!nextStatus || nextStatus === currentStatus) {
    return false;
  }

  const completedAt = nextStatus === "no_response" ? now.toISOString() : null;

  const { data: updatedRequest, error: updateErr } = await admin
    .from("requests")
    .update({
      status: nextStatus,
      ...(completedAt ? { completed_at: completedAt } : {}),
    })
    .eq("id", requestId)
    .in("status", [...OPEN_REQUEST_STATUSES_FOR_EXPIRE])
    .select("id");

  if (updateErr || !updatedRequest?.length) return false;

  const anchorInviteId = inviteRows[0] ? String(inviteRows[0].id) : undefined;
  if (!anchorInviteId) return true;

  const authorId = options.authorId ?? String(requestRow.created_by);
  const eventErr = await insertStatusChangeEvent(admin, {
    requestSupplierId: anchorInviteId,
    authorId,
    entity: "request",
    oldStatus: currentStatus,
    newStatus: nextStatus,
  });

  if (eventErr) {
    return true;
  }

  return true;
}
