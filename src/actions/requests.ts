"use server";

import { revalidatePath } from "next/cache";

import type {
  RejectRequestResult,
  SelectWinnerResult,
  UpdateRequestStatusResult,
} from "@/actions/request-status-types";
import { getProfile } from "@/lib/auth";
import { computeDeadline, parseDeadlineDays } from "@/lib/deadline";
import {
  FORBIDDEN_MANUAL_REQUEST_TARGETS,
  isManualRequestTransition,
} from "@/lib/kanban-config";
import {
  BLOCKED_REQUEST_STATUSES,
  insertStatusChangeEvent,
} from "@/lib/request-events-helpers";
import {
  canFinalizeRequest,
  cancelDuplicateOpenRequests,
  closeRequestLineItems,
  insertFinalizationEvents,
  inviteHasResponse,
  rejectTaskItemsForLoss,
  validateManualRejectReason,
} from "@/lib/request-finalization";
import type {
  FinalizationInviteRow,
  RejectReason,
} from "@/lib/request-finalization-types";
import { FINAL_INVITE_STATUSES } from "@/lib/request-finalization-types";
import { applyInProgressToInvites } from "@/lib/request-status-actions";
import type { RequestStatus } from "@/lib/request-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Roles allowed to create and send procurement requests (F002 / REQ-004). */
const REQUEST_AUTHORS = new Set(["procurement", "admin"]);

/** App setting key holding the supplier response window, in calendar days. */
const DEADLINE_SETTING_KEY = "response_deadline_days";

/** Request status a freshly created draft carries (status-machines.md). */
const REQUEST_STATUS_DRAFT = "draft" as const;

/**
 * Resting request status right after sending with no responses yet. The
 * lifecycle is `draft → new → awaiting_responses` (status-machines.md, "Отправка
 * запроса"); the stored end state is `awaiting_responses`.
 */
const REQUEST_STATUS_SENT = "awaiting_responses" as const;

/** Starting invite status for every newly created `request_suppliers` row. */
const INVITE_STATUS_NEW = "new" as const;

/** `task_items.line_status` value meaning "included in a sent request". */
const LINE_STATUS_IN_REQUEST = "in_request" as const;

/**
 * Discriminated result of {@link createRequestDraft}: on success it carries the
 * new request id and its human-readable code (e.g. `R-2026-000123`) for the UI;
 * on failure it carries a user-facing message.
 */
export type CreateRequestDraftResult =
  | { ok: true; requestId: string; requestCode: string }
  | { ok: false; error: string };

/**
 * Discriminated result of {@link sendRequest}. On success it reports which of
 * the requested suppliers actually received an in-system invite
 * (`invitedSupplierIds`) and which were skipped because they do not work inside
 * Zapros (`skippedSupplierIds`) so the UI can tell the user to contact those
 * manually.
 */
export type SendRequestResult =
  | { ok: true; requestId: string; invitedSupplierIds: string[]; skippedSupplierIds: string[] }
  | { ok: false; error: string };

/**
 * Discriminated result of {@link addSupplierToRequest}. On success it splits the
 * requested suppliers into three buckets so the UI can report precisely:
 * `addedSupplierIds` got a brand-new invite, `alreadyInvitedSupplierIds` were
 * skipped because they already had one (UNIQUE `request_id,supplier_id`), and
 * `skippedSupplierIds` were skipped because they do not work inside Zapros.
 */
export type AddSupplierToRequestResult =
  | {
      ok: true;
      requestId: string;
      addedSupplierIds: string[];
      alreadyInvitedSupplierIds: string[];
      skippedSupplierIds: string[];
    }
  | { ok: false; error: string };

/** Options accepted by {@link sendRequest}. */
export interface SendRequestOptions {
  /** Supplier ids the user selected; re-validated server-side. */
  supplierIds: string[];
  /** Whether delivery is required (saved on the request). Left as-is if omitted. */
  needsDelivery?: boolean;
  /** Free-text comment for suppliers. Left as-is if omitted. */
  comment?: string | null;
}

/** A `task_items` row copied into a request snapshot. */
interface TaskItemSnapshot {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  sort_order: number;
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Distinct, non-empty ids preserving first-seen order. */
function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
}

/**
 * Create a draft request from a subset of a task's items.
 *
 * Validates authorization, task ownership (via RLS) and that every selected
 * item belongs to the task, then inserts a `requests` row (`status='draft'`,
 * `payment_form` copied from the task) plus a `request_items` snapshot
 * (`name`/`quantity`/`unit`/`sort_order` copied from `task_items`). No invites
 * and no `line_status` change happen here — that is {@link sendRequest}.
 *
 * supabase-js has no client transactions, so the snapshot insert is atomic
 * best-effort: if it fails, the just-created request is removed with the admin
 * client before the error is returned.
 */
export async function createRequestDraft(
  taskId: string,
  taskItemIds: string[],
): Promise<CreateRequestDraftResult> {
  const profile = await getProfile();
  if (!profile || !REQUEST_AUTHORS.has(profile.role)) {
    return fail("Недостаточно прав для создания запроса.");
  }

  const itemIds = uniqueIds(taskItemIds);
  if (itemIds.length === 0) {
    return fail("Выберите хотя бы одну позицию для запроса.");
  }

  const supabase = await createClient();

  // RLS limits this to the owner's task (or any task for admin); a missing row
  // means the task does not exist or the user has no access to it.
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id, payment_form")
    .eq("id", taskId)
    .maybeSingle();
  if (taskError || !task) {
    return fail("Задача не найдена или нет доступа.");
  }

  const items = await loadTaskItemSnapshots(supabase, taskId, itemIds);
  if (items === null) {
    return fail("Не удалось загрузить позиции задачи.");
  }
  if (items.length !== itemIds.length) {
    return fail("Некоторые выбранные позиции не принадлежат этой задаче.");
  }

  const { data: inserted, error: insertError } = await supabase
    .from("requests")
    .insert({
      task_id: taskId,
      created_by: profile.id,
      status: REQUEST_STATUS_DRAFT,
      payment_form: task.payment_form,
    })
    .select("id, request_code")
    .single();
  if (insertError || !inserted) {
    return fail("Не удалось создать запрос.");
  }

  const requestId = inserted.id as string;

  const itemsError = await insertRequestItems(supabase, requestId, items);
  if (itemsError) {
    await rollbackRequest(requestId);
    return fail("Не удалось сохранить позиции запроса.");
  }

  revalidatePath(`/app/tasks/${taskId}`);
  revalidatePath("/app/requests");
  return {
    ok: true,
    requestId,
    requestCode: inserted.request_code as string,
  };
}

/**
 * Send a draft request to the selected suppliers.
 *
 * Re-validates everything server-side (the client list is never trusted):
 * authorization, request ownership (RLS), that the request is still a draft and
 * has at least one item, and that at least one selected supplier can receive an
 * in-system request (`works_in_zapros = true and is_active`). Only those
 * eligible suppliers get a `request_suppliers` invite; "contact manually"
 * suppliers (`approved` but not in Zapros) are skipped and reported back.
 *
 * Each invite gets `status='new'`, `sent_at=now()` and
 * `deadline_at = now + response_deadline_days` calendar days (MSK). The request
 * flips `draft → awaiting_responses` with its `sent_at`, and every included
 * `task_item` moves to `line_status='in_request'`.
 */
export async function sendRequest(
  requestId: string,
  options: SendRequestOptions,
): Promise<SendRequestResult> {
  const profile = await getProfile();
  if (!profile || !REQUEST_AUTHORS.has(profile.role)) {
    return fail("Недостаточно прав для отправки запроса.");
  }

  const selectedIds = uniqueIds(options.supplierIds ?? []);
  if (selectedIds.length === 0) {
    return fail("Выберите хотя бы одного поставщика.");
  }

  const supabase = await createClient();

  // RLS limits this to the owner's request (or any for admin).
  const { data: request, error: requestError } = await supabase
    .from("requests")
    .select("id, status, task_id")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError || !request) {
    return fail("Запрос не найден или нет доступа.");
  }
  if (request.status !== REQUEST_STATUS_DRAFT) {
    return fail("Запрос уже отправлен.");
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("request_items")
    .select("task_item_id")
    .eq("request_id", requestId);
  if (itemsError) {
    return fail("Не удалось загрузить позиции запроса.");
  }
  if (!itemRows || itemRows.length === 0) {
    return fail("Нельзя отправить запрос без позиций.");
  }

  // Server-side trust barrier: keep only suppliers that work inside Zapros and
  // are active, regardless of what the client sent (F010 / data-model.md
  // `can_receive_system_request`).
  const eligibleIds = await loadInSystemSupplierIds(supabase, selectedIds);
  if (eligibleIds === null) {
    return fail("Не удалось проверить поставщиков.");
  }
  if (eligibleIds.length === 0) {
    return fail(
      "Среди выбранных поставщиков нет работающих внутри системы (Zapros). " +
        "Свяжитесь с ними вручную.",
    );
  }
  const eligibleSet = new Set(eligibleIds);
  const skippedSupplierIds = selectedIds.filter((id) => !eligibleSet.has(id));

  const sentAt = new Date();
  const deadlineAt = await resolveDeadline(supabase, sentAt);
  const sentAtIso = sentAt.toISOString();
  const deadlineIso = deadlineAt.toISOString();

  const inviteRows = eligibleIds.map((supplierId) => ({
    request_id: requestId,
    supplier_id: supplierId,
    status: INVITE_STATUS_NEW,
    sent_at: sentAtIso,
    deadline_at: deadlineIso,
  }));

  // UNIQUE (request_id, supplier_id) + DO NOTHING guards against accidental
  // duplicate invites. A draft has no prior invites, so this is effectively a
  // plain insert here (matters for the post-send "add supplier" flow).
  const { error: inviteError } = await supabase
    .from("request_suppliers")
    .upsert(inviteRows, {
      onConflict: "request_id,supplier_id",
      ignoreDuplicates: true,
    });
  if (inviteError) {
    return fail("Не удалось создать приглашения поставщикам.");
  }

  const requestUpdateError = await markRequestSent(
    supabase,
    requestId,
    sentAtIso,
    options,
  );
  if (requestUpdateError) {
    // The request is still a draft; remove the invites we just created so no
    // orphaned invites point at an unsent request.
    await rollbackInvites(requestId, eligibleIds);
    return fail("Не удалось отправить запрос.");
  }

  // Best-effort, monotonic: once the request is sent, its items genuinely are
  // "in a request", so a failure here is logged but does not undo the send.
  await markItemsInRequest(supabase, itemRows);

  revalidatePath(`/app/tasks/${request.task_id}`);
  revalidatePath(`/app/requests/${requestId}`);
  revalidatePath("/app/requests");
  return {
    ok: true,
    requestId,
    invitedSupplierIds: eligibleIds,
    skippedSupplierIds,
  };
}

/**
 * Add one or more suppliers to an already-sent request (REQ-009 / F003).
 *
 * Unlike {@link sendRequest}, this targets a request that has already left the
 * draft stage: the user is reaching out to extra suppliers after the fact, so
 * every new invite gets its **own** `sent_at=now()` and a fresh
 * `deadline_at = now + response_deadline_days` calendar days (MSK) — its timer
 * starts now, independent of the original send.
 *
 * Re-validates everything server-side (the client list is never trusted):
 * authorization, request ownership (RLS), that the request is no longer a draft
 * (drafts must go through {@link sendRequest}), and the `works_in_zapros` rule.
 * Suppliers that already have an invite are detected up front and reported as
 * `alreadyInvitedSupplierIds`; the UNIQUE `(request_id, supplier_id)` constraint
 * + `ignoreDuplicates` is the final guard against a race.
 */
export async function addSupplierToRequest(
  requestId: string,
  supplierIds: string[],
): Promise<AddSupplierToRequestResult> {
  const profile = await getProfile();
  if (!profile || !REQUEST_AUTHORS.has(profile.role)) {
    return fail("Недостаточно прав для добавления поставщика.");
  }

  const selectedIds = uniqueIds(supplierIds ?? []);
  if (selectedIds.length === 0) {
    return fail("Выберите хотя бы одного поставщика.");
  }

  const supabase = await createClient();

  // RLS limits this to the owner's request (or any for admin).
  const { data: request, error: requestError } = await supabase
    .from("requests")
    .select("id, status, sent_at")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError || !request) {
    return fail("Запрос не найден или нет доступа.");
  }
  if (request.status === REQUEST_STATUS_DRAFT || !request.sent_at) {
    return fail(
      "Запрос ещё не отправлен. Добавить поставщика можно только в отправленный запрос.",
    );
  }

  // Server-side trust barrier: only in-system, active suppliers may be invited
  // (F010), regardless of what the client sent.
  const eligibleIds = await loadInSystemSupplierIds(supabase, selectedIds);
  if (eligibleIds === null) {
    return fail("Не удалось проверить поставщиков.");
  }
  const eligibleSet = new Set(eligibleIds);

  // Skip suppliers that already have an invite on this request (UNIQUE guard).
  const existingSet = await loadExistingInviteSupplierIds(
    supabase,
    requestId,
    selectedIds,
  );
  if (existingSet === null) {
    return fail("Не удалось проверить приглашённых поставщиков.");
  }

  const toAddIds = selectedIds.filter(
    (id) => eligibleSet.has(id) && !existingSet.has(id),
  );
  const alreadyInvitedSupplierIds = selectedIds.filter((id) =>
    existingSet.has(id),
  );
  const skippedSupplierIds = selectedIds.filter(
    (id) => !eligibleSet.has(id) && !existingSet.has(id),
  );

  if (toAddIds.length === 0) {
    return fail(noNewSuppliersMessage(alreadyInvitedSupplierIds.length > 0));
  }

  const sentAt = new Date();
  const deadlineAt = await resolveDeadline(supabase, sentAt);
  const sentAtIso = sentAt.toISOString();
  const deadlineIso = deadlineAt.toISOString();

  const inviteRows = toAddIds.map((supplierId) => ({
    request_id: requestId,
    supplier_id: supplierId,
    status: INVITE_STATUS_NEW,
    sent_at: sentAtIso,
    deadline_at: deadlineIso,
  }));

  // UNIQUE (request_id, supplier_id) + DO NOTHING is the final guard against a
  // concurrent add of the same supplier.
  const { error: inviteError } = await supabase
    .from("request_suppliers")
    .upsert(inviteRows, {
      onConflict: "request_id,supplier_id",
      ignoreDuplicates: true,
    });
  if (inviteError) {
    return fail("Не удалось добавить поставщиков к запросу.");
  }

  revalidatePath(`/app/requests/${requestId}`);
  revalidatePath("/app/requests");
  return {
    ok: true,
    requestId,
    addedSupplierIds: toAddIds,
    alreadyInvitedSupplierIds,
    skippedSupplierIds,
  };
}

/**
 * Manually move a sent request between working kanban columns (Phase 6 / KBN-002).
 * Validates the transition matrix, rejects finals (`won`/`lost`/…) and updates
 * active invites when the target is `in_progress`.
 */
export async function updateRequestStatus(
  requestId: string,
  targetStatus: RequestStatus,
): Promise<UpdateRequestStatusResult> {
  const profile = await getProfile();
  if (!profile || !REQUEST_AUTHORS.has(profile.role)) {
    return fail("Недостаточно прав для смены статуса запроса.");
  }

  if (FORBIDDEN_MANUAL_REQUEST_TARGETS.has(targetStatus)) {
    if (targetStatus === "won" || targetStatus === "lost") {
      return fail(
        "Завершение запроса (победа или брак) выполняется через действия «Выбрать победителя» или «Закрыть браком».",
      );
    }
    if (targetStatus === "draft") {
      return fail("Нельзя вернуть отправленный запрос в черновик.");
    }
    if (targetStatus === "cancelled") {
      return fail("Отмена запроса недоступна в этой версии.");
    }
    return fail("Этот статус нельзя выбрать вручную.");
  }

  const supabase = await createClient();
  const { data: request, error: requestError } = await supabase
    .from("requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !request) {
    return fail("Запрос не найден или нет доступа.");
  }

  const currentStatus = request.status as string;
  if (BLOCKED_REQUEST_STATUSES.has(currentStatus)) {
    return fail("Статус черновика или отменённого запроса нельзя изменить.");
  }

  if (currentStatus === targetStatus) {
    return { ok: true, requestId, status: targetStatus };
  }

  if (!isManualRequestTransition(currentStatus, targetStatus)) {
    return fail("Недопустимый переход статуса для этого запроса.");
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("requests")
    .update({ status: targetStatus })
    .eq("id", requestId);

  if (updateError) {
    return fail("Не удалось обновить статус запроса.");
  }

  const { data: anchorInvite } = await supabase
    .from("request_suppliers")
    .select("id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (anchorInvite?.id) {
    const requestEventErr = await insertStatusChangeEvent(supabase, {
      requestSupplierId: anchorInvite.id as string,
      authorId: profile.id,
      entity: "request",
      oldStatus: currentStatus,
      newStatus: targetStatus,
    });
    if (requestEventErr) {
      return fail("Не удалось записать смену статуса запроса.");
    }
  }

  if (targetStatus === "in_progress") {
    const inviteSyncError = await applyInProgressToInvites(admin, supabase, {
      requestId,
      authorId: profile.id,
    });
    if (inviteSyncError) {
      return fail(inviteSyncError);
    }
  }

  revalidatePath("/app/requests");
  revalidatePath("/app/table");
  revalidatePath(`/app/requests/${requestId}`);
  return { ok: true, requestId, status: targetStatus };
}

/**
 * Finalize a request by selecting one winning supplier (F007 / WIN-002).
 * Irreversible in MVP: other invites become `lost`, duplicate open requests
 * for the same task items are auto-cancelled.
 */
export async function selectWinner(
  requestId: string,
  winningRequestSupplierId: string,
  rejectReason: RejectReason,
  rejectComment?: string | null,
): Promise<SelectWinnerResult> {
  const profile = await getProfile();
  if (!profile || !REQUEST_AUTHORS.has(profile.role)) {
    return fail("Недостаточно прав для выбора победителя.");
  }

  const reasonError = validateManualRejectReason(rejectReason, rejectComment);
  if (reasonError) return fail(reasonError);

  const supabase = await createClient();
  const context = await loadFinalizationContext(supabase, requestId);
  if (!context) {
    return fail("Запрос не найден или нет доступа.");
  }

  if (!canFinalizeRequest(context.request.status)) {
    return fail("Этот запрос уже завершён или недоступен для победы.");
  }

  const winner = context.invites.find(
    (invite) => invite.id === winningRequestSupplierId,
  );
  if (!winner) {
    return fail("Победитель не найден среди приглашённых поставщиков.");
  }
  if (FINAL_INVITE_STATUSES.has(winner.status)) {
    return fail("Выбранное приглашение уже в финальном статусе.");
  }
  if (!inviteHasResponse(winner)) {
    return fail("У выбранного поставщика нет ответа.");
  }

  const hasAnyResponse = context.invites.some(inviteHasResponse);
  if (!hasAnyResponse) {
    return fail("Нельзя выбрать победителя без хотя бы одного ответа.");
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const normalizedComment = normalizeRejectComment(rejectComment);

  const { error: requestUpdateErr } = await admin
    .from("requests")
    .update({
      status: "won",
      outcome: "won",
      winning_supplier_id: winner.supplierId,
      winning_request_supplier_id: winningRequestSupplierId,
      reject_reason: rejectReason,
      reject_comment: normalizedComment,
      completed_at: nowIso,
    })
    .eq("id", requestId);

  if (requestUpdateErr) {
    return fail("Не удалось завершить запрос с победителем.");
  }

  for (const invite of context.invites) {
    const nextStatus = invite.id === winningRequestSupplierId ? "won" : "lost";
    if (invite.status === nextStatus) continue;
    if (FINAL_INVITE_STATUSES.has(invite.status) && invite.id !== winningRequestSupplierId) {
      continue;
    }

    const { error: inviteErr } = await admin
      .from("request_suppliers")
      .update({ status: nextStatus })
      .eq("id", invite.id);

    if (inviteErr) {
      return fail("Не удалось обновить статусы приглашений.");
    }
  }

  const taskItemIds = context.taskItemIds;
  const closeErr = await closeRequestLineItems(admin, taskItemIds);
  if (closeErr) return fail(closeErr);

  const duplicateErr = await cancelDuplicateOpenRequests({
    admin,
    eventsClient: supabase,
    winningRequestId: requestId,
    taskId: context.request.taskId,
    taskItemIds,
    authorId: profile.id,
  });
  if (duplicateErr) return fail(duplicateErr);

  const anchorInviteId = context.invites[0]?.id;
  if (anchorInviteId) {
    const eventsErr = await insertFinalizationEvents({
      eventsClient: supabase,
      authorId: profile.id,
      anchorInviteId,
      requestOldStatus: context.request.status,
      requestNewStatus: "won",
      inviteChanges: context.invites.map((invite) => ({
        requestSupplierId: invite.id,
        oldStatus: invite.status,
        newStatus: invite.id === winningRequestSupplierId ? "won" : "lost",
      })),
    });
    if (eventsErr) return fail(eventsErr);
  }

  revalidateFinalizationPaths(requestId, context.request.taskId);
  return {
    ok: true,
    requestId,
    status: "won",
    winningRequestSupplierId,
    rejectReason,
  };
}

/**
 * Reject a request without a winner (F007 / WIN-003).
 * All invites become `lost`; task items move to `rejected` (not `closed`).
 */
export async function rejectRequest(
  requestId: string,
  rejectReason: RejectReason,
  rejectComment?: string | null,
): Promise<RejectRequestResult> {
  const profile = await getProfile();
  if (!profile || !REQUEST_AUTHORS.has(profile.role)) {
    return fail("Недостаточно прав для закрытия запроса браком.");
  }

  const reasonError = validateManualRejectReason(rejectReason, rejectComment);
  if (reasonError) return fail(reasonError);

  const supabase = await createClient();
  const context = await loadFinalizationContext(supabase, requestId);
  if (!context) {
    return fail("Запрос не найден или нет доступа.");
  }

  if (!canFinalizeRequest(context.request.status)) {
    return fail("Этот запрос уже завершён или недоступен для брака.");
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const normalizedComment = normalizeRejectComment(rejectComment);

  const { error: requestUpdateErr } = await admin
    .from("requests")
    .update({
      status: "lost",
      outcome: "lost",
      reject_reason: rejectReason,
      reject_comment: normalizedComment,
      completed_at: nowIso,
      winning_supplier_id: null,
      winning_request_supplier_id: null,
    })
    .eq("id", requestId);

  if (requestUpdateErr) {
    return fail("Не удалось закрыть запрос браком.");
  }

  for (const invite of context.invites) {
    if (invite.status === "lost") continue;
    if (FINAL_INVITE_STATUSES.has(invite.status)) continue;

    const { error: inviteErr } = await admin
      .from("request_suppliers")
      .update({ status: "lost" })
      .eq("id", invite.id);

    if (inviteErr) {
      return fail("Не удалось обновить статусы приглашений.");
    }
  }

  const rejectItemsErr = await rejectTaskItemsForLoss(admin, context.taskItemIds);
  if (rejectItemsErr) return fail(rejectItemsErr);

  const anchorInviteId = context.invites[0]?.id;
  if (anchorInviteId) {
    const eventsErr = await insertFinalizationEvents({
      eventsClient: supabase,
      authorId: profile.id,
      anchorInviteId,
      requestOldStatus: context.request.status,
      requestNewStatus: "lost",
      inviteChanges: context.invites.map((invite) => ({
        requestSupplierId: invite.id,
        oldStatus: invite.status,
        newStatus: "lost",
      })),
    });
    if (eventsErr) return fail(eventsErr);
  }

  revalidateFinalizationPaths(requestId, context.request.taskId);
  return { ok: true, requestId, status: "lost", rejectReason };
}

interface FinalizationContext {
  request: {
    id: string;
    status: string;
    taskId: string;
  };
  invites: FinalizationInviteRow[];
  taskItemIds: string[];
}

async function loadFinalizationContext(
  supabase: SupabaseServerClient,
  requestId: string,
): Promise<FinalizationContext | null> {
  const { data: request, error: requestError } = await supabase
    .from("requests")
    .select("id, status, task_id")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !request) return null;

  const { data: invites, error: invitesError } = await supabase
    .from("request_suppliers")
    .select("id, supplier_id, status, first_response_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (invitesError) return null;

  const { data: items, error: itemsError } = await supabase
    .from("request_items")
    .select("task_item_id")
    .eq("request_id", requestId);

  if (itemsError) return null;

  const taskItemIds = (items ?? [])
    .map((row) => row.task_item_id as string | null)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  return {
    request: {
      id: request.id as string,
      status: request.status as string,
      taskId: request.task_id as string,
    },
    invites: (invites ?? []).map((row) => ({
      id: row.id as string,
      supplierId: row.supplier_id as string,
      status: row.status as string,
      firstResponseAt: (row.first_response_at as string | null) ?? null,
    })),
    taskItemIds,
  };
}

function normalizeRejectComment(comment: string | null | undefined): string | null {
  if (comment === undefined || comment === null) return null;
  const trimmed = comment.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function revalidateFinalizationPaths(requestId: string, taskId: string): void {
  revalidatePath("/app/requests");
  revalidatePath("/app/table");
  revalidatePath(`/app/requests/${requestId}`);
  revalidatePath(`/app/tasks/${taskId}`);
  revalidatePath("/supplier");
}

/**
 * Error message shown when an add yields no new invites: either everyone picked
 * was already invited, or the only candidates work outside Zapros.
 */
function noNewSuppliersMessage(hasAlreadyInvited: boolean): string {
  if (hasAlreadyInvited) {
    return "Выбранные поставщики уже приглашены в этот запрос.";
  }
  return (
    "Среди выбранных поставщиков нет работающих внутри системы (Zapros). " +
    "Свяжитесь с ними вручную."
  );
}

/** Minimal client surface used by the helpers, derived from `createClient`. */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Load the snapshot fields of the given task items, scoped to one task. Returns
 * `null` on a query error so the caller can distinguish "DB failed" from "items
 * do not belong to the task" (an empty/short array).
 */
async function loadTaskItemSnapshots(
  supabase: SupabaseServerClient,
  taskId: string,
  itemIds: string[],
): Promise<TaskItemSnapshot[] | null> {
  const { data, error } = await supabase
    .from("task_items")
    .select("id, name, quantity, unit, sort_order")
    .eq("task_id", taskId)
    .in("id", itemIds);
  if (error) return null;
  return (data ?? []) as TaskItemSnapshot[];
}

/**
 * Insert the request-item snapshot rows. The original `sort_order` from the task
 * is preserved so the request shows items in the same order. Returns `true` on
 * error.
 */
async function insertRequestItems(
  supabase: SupabaseServerClient,
  requestId: string,
  items: readonly TaskItemSnapshot[],
): Promise<boolean> {
  const rows = items.map((item) => ({
    request_id: requestId,
    task_item_id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    sort_order: item.sort_order,
  }));

  const { error } = await supabase.from("request_items").insert(rows);
  return Boolean(error);
}

/**
 * From a list of selected supplier ids, return only those that can receive an
 * in-system request (`works_in_zapros = true and is_active`). Returns `null` on
 * a query error. This is the single server-side trust barrier for the
 * `works_in_zapros` rule.
 */
async function loadInSystemSupplierIds(
  supabase: SupabaseServerClient,
  selectedIds: string[],
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id")
    .in("id", selectedIds)
    .eq("works_in_zapros", true)
    .eq("is_active", true);
  if (error) return null;
  return (data ?? []).map((row) => row.id as string);
}

/**
 * Return the subset of `supplierIds` that already have a `request_suppliers`
 * invite on this request, as a `Set` for O(1) membership checks. Returns `null`
 * on a query error so the caller can distinguish "DB failed" from "none exist".
 */
async function loadExistingInviteSupplierIds(
  supabase: SupabaseServerClient,
  requestId: string,
  supplierIds: string[],
): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from("request_suppliers")
    .select("supplier_id")
    .eq("request_id", requestId)
    .in("supplier_id", supplierIds);
  if (error) return null;
  return new Set((data ?? []).map((row) => row.supplier_id as string));
}

/**
 * Resolve the invite deadline from `app_settings.response_deadline_days`,
 * falling back to the documented default when the setting is missing or
 * unreadable. Always returns a concrete deadline instant.
 */
async function resolveDeadline(
  supabase: SupabaseServerClient,
  sentAt: Date,
): Promise<Date> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", DEADLINE_SETTING_KEY)
    .maybeSingle();

  const days = parseDeadlineDays(data?.value ?? null);
  return computeDeadline(sentAt, days);
}

/**
 * Flip a draft request to its sent state: set `status`, `sent_at` and persist
 * the user's `needs_delivery` / `comment` edits when provided (omitted fields
 * keep their draft value). Returns `true` on error.
 */
async function markRequestSent(
  supabase: SupabaseServerClient,
  requestId: string,
  sentAtIso: string,
  options: SendRequestOptions,
): Promise<boolean> {
  const update: Record<string, unknown> = {
    status: REQUEST_STATUS_SENT,
    sent_at: sentAtIso,
  };
  if (options.needsDelivery !== undefined) {
    update.needs_delivery = options.needsDelivery;
  }
  if (options.comment !== undefined) {
    update.comment = options.comment;
  }

  const { error } = await supabase
    .from("requests")
    .update(update)
    .eq("id", requestId);
  return Boolean(error);
}

/**
 * Move every task item included in the request to `line_status='in_request'`.
 * Duplicates are allowed (an item may be `in_request` from several requests at
 * once), so this only ever sets the flag and never reverts it. Best-effort: a
 * failure is logged but does not fail the (already committed) send.
 */
async function markItemsInRequest(
  supabase: SupabaseServerClient,
  itemRows: readonly { task_item_id: string | null }[],
): Promise<void> {
  const taskItemIds = itemRows
    .map((row) => row.task_item_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (taskItemIds.length === 0) return;

  const { error } = await supabase
    .from("task_items")
    .update({ line_status: LINE_STATUS_IN_REQUEST })
    .in("id", taskItemIds);
  if (error) {
    console.error(
      `Не удалось обновить line_status позиций запроса: ${error.message}`,
    );
  }
}

/**
 * Remove an orphaned request after a failed item-snapshot insert. Uses the admin
 * client for a reliable cleanup independent of policy edge cases; the cascade FK
 * removes any partial `request_items`.
 */
async function rollbackRequest(requestId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("requests").delete().eq("id", requestId);
  if (error) {
    console.error(
      `Откат осиротевшего запроса ${requestId} не удался: ${error.message}`,
    );
  }
}

/**
 * Remove the invites just created for a request when the subsequent request
 * update fails, so the draft is left clean. Uses the admin client for a
 * reliable cleanup.
 */
async function rollbackInvites(
  requestId: string,
  supplierIds: string[],
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("request_suppliers")
    .delete()
    .eq("request_id", requestId)
    .in("supplier_id", supplierIds);
  if (error) {
    console.error(
      `Откат приглашений запроса ${requestId} не удался: ${error.message}`,
    );
  }
}
