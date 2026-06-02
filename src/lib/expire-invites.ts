import type { SupabaseClient } from "@supabase/supabase-js";

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

function parseRequestJoin(
  requests: { created_by: string; status: string } | { created_by: string; status: string }[] | null,
): { createdBy: string; status: string } | null {
  if (!requests) return null;
  const row = Array.isArray(requests) ? requests[0] : requests;
  if (!row) return null;
  return { createdBy: row.created_by, status: row.status };
}

/**
 * Expire overdue invites and archive empty requests (F007 cron).
 */
export async function runExpireInvites(
  admin: SupabaseClient,
  now: Date,
  options: RunExpireInvitesOptions = {},
): Promise<RunExpireInvitesResult> {
  const result: RunExpireInvitesResult = {
    expiredInviteCount: 0,
    updatedRequestCount: 0,
    errors: [],
  };

  const { data, error } = await admin
    .from("request_suppliers")
    .select(
      `
      id,
      request_id,
      status,
      deadline_at,
      timer_paused_at,
      first_response_at,
      requests!request_suppliers_request_id_fkey ( created_by, status )
    `,
    )
    .lt("deadline_at", now.toISOString())
    .is("timer_paused_at", null)
    .in("status", [...EXPIRABLE_INVITE_STATUSES]);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  const candidates: ExpireInviteCandidate[] = [];
  for (const row of data ?? []) {
    const request = parseRequestJoin(
      row.requests as
        | { created_by: string; status: string }
        | { created_by: string; status: string }[]
        | null,
    );
    if (!request) continue;

    candidates.push({
      id: row.id as string,
      requestId: row.request_id as string,
      status: row.status as string,
      deadlineAt: (row.deadline_at as string | null) ?? null,
      timerPausedAt: (row.timer_paused_at as string | null) ?? null,
      firstResponseAt: (row.first_response_at as string | null) ?? null,
      requestStatus: request.status,
      requestCreatedBy: request.createdBy,
    });
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
  admin: SupabaseClient,
  requestId: string,
  now: Date,
  options: RunExpireInvitesOptions,
): Promise<boolean> {
  const { data: requestRow, error: requestErr } = await admin
    .from("requests")
    .select("id, status, created_by")
    .eq("id", requestId)
    .maybeSingle();

  if (requestErr || !requestRow) return false;

  const currentStatus = requestRow.status as string;
  if (FINAL_REQUEST_STATUSES.has(currentStatus)) {
    return false;
  }

  const { data: inviteRows, error: invitesErr } = await admin
    .from("request_suppliers")
    .select("id, status, first_response_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (invitesErr || !inviteRows) return false;

  const statuses = inviteRows.map((row) => row.status as string);
  const hasAnyResponse = inviteRows.some(
    (row) => (row.first_response_at as string | null) != null,
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

  const anchorInviteId = inviteRows[0]?.id as string | undefined;
  if (!anchorInviteId) return true;

  const authorId = options.authorId ?? (requestRow.created_by as string);
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
