"use server";

import { revalidatePath } from "next/cache";

import { getProfile } from "@/lib/auth";
import { extendDeadlineByPauseDuration } from "@/lib/deadline";
import {
  BLOCKED_REQUEST_STATUSES,
  FINAL_REQUEST_STATUSES,
  INVITE_STATUS_ANSWERED,
  INVITE_STATUS_CLARIFICATION,
  REQUEST_STATUS_CLARIFICATION,
  REQUEST_STATUS_IN_PROGRESS,
  THREAD_ACTIVE_INVITE_STATUSES,
  aggregateRequestStatus,
  failEvent,
  insertRequestEvent,
  insertStatusChangeEvent,
  loadInviteEventContext,
  loadInviteStatusesForRequest,
  validateThreadAccess,
} from "@/lib/request-events-helpers";
import { applyInProgressToInvites } from "@/lib/request-status-actions";
import type {
  EventActionResult,
  QuickSignalType,
} from "@/lib/request-events-types";
import {
  MAX_EVENT_BODY_LENGTH,
  QUICK_SIGNAL_TYPES,
  REQUEST_EVENT_MESSAGE,
  REQUEST_EVENT_REQUEST_UPDATED,
  REQUEST_EVENT_SIGNAL_IN_PROGRESS,
} from "@/lib/request-events-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const PROCUREMENT_ROLES = new Set(["procurement", "admin"]);

function normalizeBody(body: string | null | undefined): string | null {
  if (body === undefined || body === null) return null;
  const trimmed = body.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_EVENT_BODY_LENGTH) {
    return trimmed.slice(0, MAX_EVENT_BODY_LENGTH);
  }
  return trimmed;
}

function validateMessageBody(body: string | null | undefined): string | null {
  const normalized = normalizeBody(body);
  if (!normalized) {
    return "Введите текст сообщения.";
  }
  return null;
}

function revalidateThreadPaths(requestId: string, requestSupplierId: string): void {
  revalidatePath(`/app/requests/${requestId}`);
  revalidatePath(`/supplier/requests/${requestSupplierId}`);
  revalidatePath("/supplier");
  revalidatePath("/app/requests");
}

/**
 * Post a text message in the invite thread (procurement owner or invited supplier).
 */
export async function postRequestMessage(
  requestSupplierId: string,
  body: string,
): Promise<EventActionResult> {
  const profile = await getProfile();
  if (!profile) {
    return failEvent("Необходима авторизация.");
  }

  const bodyError = validateMessageBody(body);
  if (bodyError) return failEvent(bodyError);

  const isSupplier = profile.role === "supplier";
  const isProcurement = PROCUREMENT_ROLES.has(profile.role);
  if (!isSupplier && !isProcurement) {
    return failEvent("Недостаточно прав для отправки сообщения.");
  }

  const supabase = await createClient();
  const invite = await loadInviteEventContext(supabase, requestSupplierId);
  if (!invite) {
    return failEvent("Приглашение не найдено или нет доступа.");
  }

  if (isSupplier) {
    if (!profile.supplier_id || invite.supplierId !== profile.supplier_id) {
      return failEvent("Приглашение не найдено или нет доступа.");
    }
  }

  const accessError = validateThreadAccess(invite);
  if (accessError) return failEvent(accessError);

  const inserted = await insertRequestEvent(supabase, {
    requestSupplierId,
    authorId: profile.id,
    eventType: REQUEST_EVENT_MESSAGE,
    body: normalizeBody(body),
  });
  if (inserted) {
    return failEvent("Не удалось отправить сообщение.");
  }

  revalidateThreadPaths(invite.requestId, requestSupplierId);
  return { ok: true };
}

/**
 * Procurement quick signal on an invite thread.
 */
export async function postQuickSignal(
  requestSupplierId: string,
  signalType: QuickSignalType,
  optionalComment?: string | null,
): Promise<EventActionResult> {
  const profile = await getProfile();
  if (!profile || !PROCUREMENT_ROLES.has(profile.role)) {
    return failEvent("Недостаточно прав для отправки сигнала.");
  }

  if (!QUICK_SIGNAL_TYPES.has(signalType)) {
    return failEvent("Неизвестный тип сигнала.");
  }

  const supabase = await createClient();
  const invite = await loadInviteEventContext(supabase, requestSupplierId);
  if (!invite) {
    return failEvent("Приглашение не найдено или нет доступа.");
  }

  const accessError = validateThreadAccess(invite);
  if (accessError) return failEvent(accessError);

  const comment = normalizeBody(optionalComment);
  const payload = comment ? { comment } : null;

  const signalInserted = await insertRequestEvent(supabase, {
    requestSupplierId,
    authorId: profile.id,
    eventType: signalType,
    body: comment,
    payload,
  });
  if (signalInserted) {
    return failEvent("Не удалось отправить сигнал.");
  }

  if (signalType === REQUEST_EVENT_SIGNAL_IN_PROGRESS) {
    const admin = createAdminClient();
    const oldRequestStatus = invite.requestStatus;

    if (
      !FINAL_REQUEST_STATUSES.has(oldRequestStatus) &&
      !BLOCKED_REQUEST_STATUSES.has(oldRequestStatus)
    ) {
      const inviteSyncError = await applyInProgressToInvites(admin, supabase, {
        requestId: invite.requestId,
        authorId: profile.id,
        onlyInviteId: requestSupplierId,
      });
      if (inviteSyncError) {
        return failEvent(inviteSyncError);
      }

      if (
        oldRequestStatus !== REQUEST_STATUS_IN_PROGRESS &&
        !FINAL_REQUEST_STATUSES.has(oldRequestStatus)
      ) {
        const { error: requestErr } = await admin
          .from("requests")
          .update({ status: REQUEST_STATUS_IN_PROGRESS })
          .eq("id", invite.requestId)
          .in("status", [
            "new",
            "awaiting_responses",
            "has_response",
            "clarification",
          ]);

        if (!requestErr && oldRequestStatus !== REQUEST_STATUS_IN_PROGRESS) {
          const requestStatusEventErr = await insertStatusChangeEvent(supabase, {
            requestSupplierId,
            authorId: profile.id,
            entity: "request",
            oldStatus: oldRequestStatus,
            newStatus: REQUEST_STATUS_IN_PROGRESS,
          });
          if (requestStatusEventErr) {
            return failEvent("Не удалось записать смену статуса запроса.");
          }
        }
      }
    }
  }

  revalidateThreadPaths(invite.requestId, requestSupplierId);
  return { ok: true };
}

/**
 * Procurement: move invite (and request) into clarification and pause the timer.
 */
export async function requestClarification(
  requestSupplierId: string,
  body?: string | null,
): Promise<EventActionResult> {
  const profile = await getProfile();
  if (!profile || !PROCUREMENT_ROLES.has(profile.role)) {
    return failEvent("Недостаточно прав для запроса уточнения.");
  }

  const supabase = await createClient();
  const invite = await loadInviteEventContext(supabase, requestSupplierId);
  if (!invite) {
    return failEvent("Приглашение не найдено или нет доступа.");
  }

  if (BLOCKED_REQUEST_STATUSES.has(invite.requestStatus)) {
    return failEvent("Запрос недоступен для уточнения.");
  }

  if (!THREAD_ACTIVE_INVITE_STATUSES.has(invite.status)) {
    return failEvent("На этом приглашении нельзя запросить уточнение.");
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const oldInviteStatus = invite.status;
  const oldRequestStatus = invite.requestStatus;

  const { error: inviteErr } = await admin
    .from("request_suppliers")
    .update({
      status: INVITE_STATUS_CLARIFICATION,
      timer_paused_at: nowIso,
    })
    .eq("id", requestSupplierId);

  if (inviteErr) {
    return failEvent("Не удалось обновить приглашение.");
  }

  if (oldInviteStatus !== INVITE_STATUS_CLARIFICATION) {
    const inviteEventErr = await insertStatusChangeEvent(supabase, {
      requestSupplierId,
      authorId: profile.id,
      entity: "invite",
      oldStatus: oldInviteStatus,
      newStatus: INVITE_STATUS_CLARIFICATION,
    });
    if (inviteEventErr) {
      return failEvent("Не удалось записать смену статуса.");
    }
  }

  if (
    !FINAL_REQUEST_STATUSES.has(oldRequestStatus) &&
    oldRequestStatus !== REQUEST_STATUS_CLARIFICATION
  ) {
    const { error: requestErr } = await admin
      .from("requests")
      .update({ status: REQUEST_STATUS_CLARIFICATION })
      .eq("id", invite.requestId)
      .in("status", [
        "new",
        "awaiting_responses",
        "has_response",
        "in_progress",
      ]);

    if (!requestErr) {
      const requestEventErr = await insertStatusChangeEvent(supabase, {
        requestSupplierId,
        authorId: profile.id,
        entity: "request",
        oldStatus: oldRequestStatus,
        newStatus: REQUEST_STATUS_CLARIFICATION,
      });
      if (requestEventErr) {
        return failEvent("Не удалось записать смену статуса запроса.");
      }
    }
  }

  const changeSummary = normalizeBody(body);
  if (changeSummary) {
    const updatedErr = await insertRequestEvent(supabase, {
      requestSupplierId,
      authorId: profile.id,
      eventType: REQUEST_EVENT_REQUEST_UPDATED,
      body: changeSummary,
    });
    if (updatedErr) {
      return failEvent("Не удалось сохранить описание уточнения.");
    }
  }

  revalidateThreadPaths(invite.requestId, requestSupplierId);
  return { ok: true };
}

/**
 * Procurement: end clarification without a new supplier response; resume timer.
 */
export async function resumeFromClarification(
  requestSupplierId: string,
): Promise<EventActionResult> {
  const profile = await getProfile();
  if (!profile || !PROCUREMENT_ROLES.has(profile.role)) {
    return failEvent("Недостаточно прав для снятия уточнения.");
  }

  const supabase = await createClient();
  const invite = await loadInviteEventContext(supabase, requestSupplierId);
  if (!invite) {
    return failEvent("Приглашение не найдено или нет доступа.");
  }

  if (invite.status !== INVITE_STATUS_CLARIFICATION) {
    return failEvent("Приглашение не находится на уточнении.");
  }

  const admin = createAdminClient();
  const oldInviteStatus = invite.status;
  const oldRequestStatus = invite.requestStatus;
  const nextInviteStatus = INVITE_STATUS_ANSWERED;
  const now = new Date();

  const inviteUpdate: {
    status: typeof INVITE_STATUS_ANSWERED;
    timer_paused_at: null;
    deadline_at?: string;
  } = {
    status: nextInviteStatus,
    timer_paused_at: null,
  };

  if (invite.timerPausedAt && invite.deadlineAt) {
    const deadline = new Date(invite.deadlineAt);
    const pausedAt = new Date(invite.timerPausedAt);
    if (
      !Number.isNaN(deadline.getTime()) &&
      !Number.isNaN(pausedAt.getTime())
    ) {
      inviteUpdate.deadline_at = extendDeadlineByPauseDuration(
        deadline,
        pausedAt,
        now,
      ).toISOString();
    }
  }

  const { error: inviteErr } = await admin
    .from("request_suppliers")
    .update(inviteUpdate)
    .eq("id", requestSupplierId);

  if (inviteErr) {
    return failEvent("Не удалось обновить приглашение.");
  }

  const inviteEventErr = await insertStatusChangeEvent(supabase, {
    requestSupplierId,
    authorId: profile.id,
    entity: "invite",
    oldStatus: oldInviteStatus,
    newStatus: nextInviteStatus,
  });
  if (inviteEventErr) {
    return failEvent("Не удалось записать смену статуса.");
  }

  const statuses = await loadInviteStatusesForRequest(supabase, invite.requestId);
  if (statuses === null) {
    return failEvent("Не удалось пересчитать статус запроса.");
  }

  const nextRequestStatus = aggregateRequestStatus(statuses, oldRequestStatus);
  if (
    nextRequestStatus &&
    nextRequestStatus !== oldRequestStatus &&
    !FINAL_REQUEST_STATUSES.has(oldRequestStatus)
  ) {
    const { error: requestErr } = await admin
      .from("requests")
      .update({ status: nextRequestStatus })
      .eq("id", invite.requestId)
      .in("status", [
        "new",
        "awaiting_responses",
        "has_response",
        REQUEST_STATUS_CLARIFICATION,
        REQUEST_STATUS_IN_PROGRESS,
      ]);

    if (!requestErr) {
      const requestEventErr = await insertStatusChangeEvent(supabase, {
        requestSupplierId,
        authorId: profile.id,
        entity: "request",
        oldStatus: oldRequestStatus,
        newStatus: nextRequestStatus,
      });
      if (requestEventErr) {
        return failEvent("Не удалось записать смену статуса запроса.");
      }
    }
  }

  revalidateThreadPaths(invite.requestId, requestSupplierId);
  return { ok: true };
}
