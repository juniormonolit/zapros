"use server";

import { revalidatePath } from "next/cache";

import { getProfile } from "@/lib/auth";
import { extendDeadlineByPauseDuration } from "@/lib/deadline";
import type { PaymentForm } from "@/lib/parser/bitrix";
import {
  INVITE_STATUS_CLARIFICATION,
  aggregateRequestStatus,
  insertRequestEvent,
  insertStatusChangeEvent,
  loadInviteStatusesForRequest,
} from "@/lib/request-events-helpers";
import {
  REQUEST_EVENT_RESPONSE_SUBMITTED,
} from "@/lib/request-events-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Invite statuses that still allow submitting a new response version. */
const ACTIVE_INVITE_STATUSES = new Set([
  "new",
  "answered",
  "under_review",
  "clarification",
  "in_progress",
]);

/** Request statuses promoted to `has_response` on the first supplier answer. */
const REQUEST_STATUSES_FIRST_RESPONSE = new Set(["awaiting_responses", "new"]);

const INVITE_STATUS_ANSWERED = "answered" as const;
const REQUEST_STATUS_HAS_RESPONSE = "has_response" as const;

const BLOCKED_REQUEST_STATUSES = new Set(["draft", "cancelled"]);

/**
 * Discriminated result of {@link submitResponseVersion}: on success it returns the
 * new version id and its 1-based sequence number; on failure a user-facing message.
 */
export type SubmitResponseVersionResult =
  | { ok: true; versionId: string; versionNumber: number }
  | { ok: false; error: string };

/** One response row for a `request_items` line (camelCase API → snake_case DB). */
export interface SubmitLineInput {
  requestItemId: string;
  priceWithVat?: number | null;
  priceCash?: number | null;
  priceWithoutVat?: number | null;
  deliveryPrice?: number | null;
  priceIncludesDelivery?: boolean | null;
  inStock?: boolean | null;
  leadTimeDays?: number | null;
  lineComment?: string | null;
}

interface SubmitResponseInput {
  comment?: string | null;
  lines: SubmitLineInput[];
}

interface InviteContext {
  id: string;
  supplierId: string;
  status: string;
  firstResponseAt: string | null;
  deadlineAt: string | null;
  timerPausedAt: string | null;
  requestId: string;
}

interface RequestContext {
  id: string;
  status: string;
  paymentForm: PaymentForm | null;
  needsDelivery: boolean;
  sentAt: string | null;
}

interface NormalizedLine {
  requestItemId: string;
  priceWithVat: number | null;
  priceCash: number | null;
  priceWithoutVat: number | null;
  deliveryPrice: number | null;
  priceIncludesDelivery: boolean;
  inStock: boolean | null;
  leadTimeDays: number | null;
  lineComment: string | null;
}

function fail(error: string): SubmitResponseVersionResult {
  return { ok: false, error };
}

/**
 * Submit a new supplier response version for an invite.
 *
 * Validates role, invite/request state, line ownership, XOR/payment/delivery
 * rules, then inserts an immutable version + line snapshot (user client / RLS),
 * flips `is_current` on prior versions, and updates invite/request statuses via
 * the admin client (suppliers cannot UPDATE `request_suppliers` per migration 010).
 */
export async function submitResponseVersion(
  requestSupplierId: string,
  input: SubmitResponseInput,
): Promise<SubmitResponseVersionResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "supplier") {
    return fail("Недостаточно прав для отправки ответа.");
  }
  if (!profile.supplier_id) {
    return fail("Профиль поставщика не привязан к организации.");
  }

  const lines = input.lines ?? [];
  if (lines.length === 0) {
    return fail("Добавьте хотя бы одну строку ответа.");
  }

  const supabase = await createClient();

  const context = await loadInviteContext(supabase, requestSupplierId);
  if (!context) {
    return fail("Приглашение не найдено или нет доступа.");
  }

  if (context.invite.supplierId !== profile.supplier_id) {
    return fail("Приглашение не найдено или нет доступа.");
  }

  const requestError = validateRequest(context.request);
  if (requestError) return fail(requestError);

  const inviteError = validateInvite(context.invite);
  if (inviteError) return fail(inviteError);

  const requestItemIds = await loadRequestItemIds(supabase, context.request.id);
  if (requestItemIds === null) {
    return fail("Не удалось загрузить позиции запроса.");
  }

  const normalized = normalizeLines(
    lines,
    requestItemIds,
    context.request.paymentForm,
    context.request.needsDelivery,
  );
  if (typeof normalized === "string") {
    return fail(normalized);
  }

  const versionNumber = await nextVersionNumber(supabase, requestSupplierId);
  if (versionNumber === null) {
    return fail("Не удалось определить номер версии.");
  }

  const isFirstResponseOnRequest = await isFirstResponseForRequest(
    supabase,
    context.request.id,
  );
  if (isFirstResponseOnRequest === null) {
    return fail("Не удалось проверить ответы по запросу.");
  }

  const flipError = await clearCurrentVersions(supabase, requestSupplierId);
  if (flipError) {
    return fail("Не удалось обновить предыдущие версии ответа.");
  }

  const versionId = await insertVersion(supabase, {
    requestSupplierId,
    versionNumber,
    comment: normalizeComment(input.comment),
    createdBy: profile.id,
  });
  if (!versionId) {
    return fail("Не удалось сохранить версию ответа.");
  }

  const linesError = await insertLineItems(supabase, versionId, normalized);
  if (linesError) {
    await rollbackVersion(versionId);
    return fail("Не удалось сохранить строки ответа.");
  }

  const wasClarification = context.invite.status === INVITE_STATUS_CLARIFICATION;
  const admin = createAdminClient();
  const inviteUpdateError = await markInviteAnswered(
    admin,
    requestSupplierId,
    context.invite.firstResponseAt,
    wasClarification,
    wasClarification ? context.invite : null,
  );
  if (inviteUpdateError) {
    await rollbackVersion(versionId);
    return fail("Не удалось обновить статус приглашения.");
  }

  const responseEventError = await insertRequestEvent(supabase, {
    requestSupplierId,
    authorId: profile.id,
    eventType: REQUEST_EVENT_RESPONSE_SUBMITTED,
    payload: { versionId, versionNumber },
  });
  if (responseEventError) {
    await rollbackVersion(versionId);
    return fail("Не удалось записать событие ответа.");
  }

  if (wasClarification) {
    const statuses = await loadInviteStatusesForRequest(
      supabase,
      context.request.id,
    );
    if (statuses === null) {
      await rollbackVersion(versionId);
      return fail("Не удалось пересчитать статус запроса.");
    }

    const nextRequestStatus = aggregateRequestStatus(
      statuses,
      context.request.status,
    );
    if (nextRequestStatus && nextRequestStatus !== context.request.status) {
      const { error: requestErr } = await admin
        .from("requests")
        .update({ status: nextRequestStatus })
        .eq("id", context.request.id)
        .in("status", [
          "new",
          "awaiting_responses",
          "has_response",
          "clarification",
          "in_progress",
        ]);

      if (requestErr) {
        await rollbackVersion(versionId);
        return fail("Не удалось обновить статус запроса.");
      }

      const statusEventErr = await insertStatusChangeEvent(admin, {
        requestSupplierId,
        authorId: profile.id,
        entity: "request",
        oldStatus: context.request.status,
        newStatus: nextRequestStatus,
      });
      if (statusEventErr) {
        await rollbackVersion(versionId);
        return fail("Не удалось записать смену статуса запроса.");
      }
    }
  } else if (
    isFirstResponseOnRequest &&
    REQUEST_STATUSES_FIRST_RESPONSE.has(context.request.status)
  ) {
    const requestUpdateError = await markRequestHasResponse(
      admin,
      context.request.id,
    );
    if (requestUpdateError) {
      await rollbackVersion(versionId);
      return fail("Не удалось обновить статус запроса.");
    }
  }

  revalidatePath("/supplier");
  revalidatePath(`/supplier/requests/${requestSupplierId}`);
  revalidatePath(`/app/requests/${context.request.id}`);

  return { ok: true, versionId, versionNumber };
}

/** Minimal client surface used by helpers, derived from `createClient`. */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

async function loadInviteContext(
  supabase: SupabaseServerClient,
  requestSupplierId: string,
): Promise<{ invite: InviteContext; request: RequestContext } | null> {
  const { data, error } = await supabase
    .from("request_suppliers")
    .select(
      `
      id,
      supplier_id,
      status,
      first_response_at,
      deadline_at,
      timer_paused_at,
      request_id,
      requests!request_suppliers_request_id_fkey (
        id,
        status,
        payment_form,
        needs_delivery,
        sent_at
      )
    `,
    )
    .eq("id", requestSupplierId)
    .maybeSingle();

  if (error || !data) return null;

  const requestRow = data.requests as
    | {
        id: string;
        status: string;
        payment_form: PaymentForm | null;
        needs_delivery: boolean;
        sent_at: string | null;
      }
    | {
        id: string;
        status: string;
        payment_form: PaymentForm | null;
        needs_delivery: boolean;
        sent_at: string | null;
      }[]
    | null;

  const request = Array.isArray(requestRow) ? requestRow[0] : requestRow;
  if (!request) return null;

  return {
    invite: {
      id: data.id as string,
      supplierId: data.supplier_id as string,
      status: data.status as string,
      firstResponseAt: (data.first_response_at as string | null) ?? null,
      deadlineAt: (data.deadline_at as string | null) ?? null,
      timerPausedAt: (data.timer_paused_at as string | null) ?? null,
      requestId: data.request_id as string,
    },
    request: {
      id: request.id,
      status: request.status,
      paymentForm: request.payment_form,
      needsDelivery: Boolean(request.needs_delivery),
      sentAt: request.sent_at,
    },
  };
}

function validateRequest(request: RequestContext): string | null {
  if (BLOCKED_REQUEST_STATUSES.has(request.status)) {
    return "Запрос недоступен для ответа.";
  }
  if (!request.sentAt) {
    return "Запрос ещё не отправлен.";
  }
  return null;
}

function validateInvite(invite: InviteContext): string | null {
  if (!ACTIVE_INVITE_STATUSES.has(invite.status)) {
    return "На этом приглашении больше нельзя отправлять ответ.";
  }
  return null;
}

async function loadRequestItemIds(
  supabase: SupabaseServerClient,
  requestId: string,
): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from("request_items")
    .select("id")
    .eq("request_id", requestId);
  if (error) return null;
  return new Set((data ?? []).map((row) => row.id as string));
}

function normalizeComment(comment: string | null | undefined): string | null {
  if (comment === undefined || comment === null) return null;
  const trimmed = comment.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLines(
  lines: SubmitLineInput[],
  requestItemIds: Set<string>,
  paymentForm: PaymentForm | null,
  needsDelivery: boolean,
): NormalizedLine[] | string {
  const normalized: NormalizedLine[] = [];
  const seenItemIds = new Set<string>();

  for (const line of lines) {
    const requestItemId = line.requestItemId;
    if (typeof requestItemId !== "string" || requestItemId.length === 0) {
      return "Укажите позицию запроса для каждой строки.";
    }
    if (!requestItemIds.has(requestItemId)) {
      return "Некоторые строки не принадлежат этому запросу.";
    }
    if (seenItemIds.has(requestItemId)) {
      return "Позиция запроса указана более одного раза.";
    }
    seenItemIds.add(requestItemId);

    const lineError = validateLineFields(
      line,
      paymentForm,
      needsDelivery,
    );
    if (lineError) return lineError;

    const row = toNormalizedLine(line, needsDelivery);
    if (lineHasMeaningfulData(row)) {
      normalized.push(row);
    }
  }

  if (normalized.length === 0) {
    return "Заполните хотя бы одну строку: цена, наличие или срок поставки.";
  }

  return normalized;
}

function validateLineFields(
  line: SubmitLineInput,
  paymentForm: PaymentForm | null,
  needsDelivery: boolean,
): string | null {
  const hasInStock = line.inStock !== undefined && line.inStock !== null;
  const hasLeadTime =
    line.leadTimeDays !== undefined && line.leadTimeDays !== null;

  if (hasInStock && hasLeadTime) {
    return "Укажите либо наличие, либо срок поставки, но не оба поля.";
  }

  if (hasLeadTime && !isPositiveInteger(line.leadTimeDays)) {
    return "Срок поставки должен быть целым числом больше нуля.";
  }

  const deliveryPrice = line.deliveryPrice;
  const includesDelivery = line.priceIncludesDelivery === true;

  if (deliveryPrice != null && includesDelivery) {
    return "Укажите либо стоимость доставки, либо «цена с доставкой».";
  }

  if (!needsDelivery) {
    if (deliveryPrice != null) {
      return "Для этого запроса доставка не требуется.";
    }
    if (includesDelivery) {
      return "Для этого запроса доставка не требуется.";
    }
  }

  if (paymentForm === "non_cash" && line.priceCash != null) {
    return "Для безналичной оплаты поле «нал» недоступно.";
  }

  const numericFields: { value: number | null | undefined; label: string }[] = [
    { value: line.priceWithVat, label: "цена с НДС" },
    { value: line.priceCash, label: "цена нал" },
    { value: line.priceWithoutVat, label: "цена без НДС" },
    { value: deliveryPrice, label: "доставка" },
  ];

  for (const { value, label } of numericFields) {
    if (value != null && !isNonNegativeNumber(value)) {
      return `Поле «${label}» не может быть отрицательным.`;
    }
  }

  return null;
}

function toNormalizedLine(
  line: SubmitLineInput,
  needsDelivery: boolean,
): NormalizedLine {
  return {
    requestItemId: line.requestItemId,
    priceWithVat: nullableNumber(line.priceWithVat),
    priceCash: nullableNumber(line.priceCash),
    priceWithoutVat: nullableNumber(line.priceWithoutVat),
    deliveryPrice: needsDelivery ? nullableNumber(line.deliveryPrice) : null,
    priceIncludesDelivery: needsDelivery
      ? line.priceIncludesDelivery === true
      : false,
    inStock:
      line.inStock === undefined || line.inStock === null
        ? null
        : Boolean(line.inStock),
    leadTimeDays:
      line.leadTimeDays === undefined || line.leadTimeDays === null
        ? null
        : Number(line.leadTimeDays),
    lineComment: normalizeComment(line.lineComment),
  };
}

function lineHasMeaningfulData(line: NormalizedLine): boolean {
  return (
    line.priceWithVat != null ||
    line.priceCash != null ||
    line.priceWithoutVat != null ||
    line.inStock != null ||
    line.leadTimeDays != null
  );
}

function nullableNumber(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  return value;
}

function isNonNegativeNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

async function nextVersionNumber(
  supabase: SupabaseServerClient,
  requestSupplierId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("supplier_response_versions")
    .select("version_number")
    .eq("request_supplier_id", requestSupplierId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  const current = data?.version_number;
  return typeof current === "number" ? current + 1 : 1;
}

async function isFirstResponseForRequest(
  supabase: SupabaseServerClient,
  requestId: string,
): Promise<boolean | null> {
  const { data: invites, error: invitesError } = await supabase
    .from("request_suppliers")
    .select("id")
    .eq("request_id", requestId);
  if (invitesError) return null;

  const inviteIds = (invites ?? []).map((row) => row.id as string);
  if (inviteIds.length === 0) return true;

  const { count, error } = await supabase
    .from("supplier_response_versions")
    .select("id", { count: "exact", head: true })
    .in("request_supplier_id", inviteIds);

  if (error) return null;
  return (count ?? 0) === 0;
}

async function clearCurrentVersions(
  supabase: SupabaseServerClient,
  requestSupplierId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("supplier_response_versions")
    .update({ is_current: false })
    .eq("request_supplier_id", requestSupplierId)
    .eq("is_current", true);
  return Boolean(error);
}

async function insertVersion(
  supabase: SupabaseServerClient,
  params: {
    requestSupplierId: string;
    versionNumber: number;
    comment: string | null;
    createdBy: string;
  },
): Promise<string | null> {
  // Avoid `.insert().select()` — PostgREST RETURNING can fail RLS SELECT even when
  // a follow-up SELECT on the same row succeeds (supplier_owns_version vs invite FK).
  const { error: insertError } = await supabase
    .from("supplier_response_versions")
    .insert({
      request_supplier_id: params.requestSupplierId,
      version_number: params.versionNumber,
      is_current: true,
      comment: params.comment,
      created_by: params.createdBy,
    });
  if (insertError) return null;

  const { data, error: selectError } = await supabase
    .from("supplier_response_versions")
    .select("id")
    .eq("request_supplier_id", params.requestSupplierId)
    .eq("version_number", params.versionNumber)
    .maybeSingle();

  if (selectError || !data) return null;
  return data.id as string;
}

async function insertLineItems(
  supabase: SupabaseServerClient,
  versionId: string,
  lines: NormalizedLine[],
): Promise<boolean> {
  const rows = lines.map((line) => ({
    version_id: versionId,
    request_item_id: line.requestItemId,
    price_with_vat: line.priceWithVat,
    price_cash: line.priceCash,
    price_without_vat: line.priceWithoutVat,
    delivery_price: line.deliveryPrice,
    price_includes_delivery: line.priceIncludesDelivery,
    in_stock: line.inStock,
    lead_time_days: line.leadTimeDays,
    line_comment: line.lineComment,
  }));

  const { error } = await supabase.from("response_line_items").insert(rows);
  return Boolean(error);
}

async function markInviteAnswered(
  admin: SupabaseAdminClient,
  requestSupplierId: string,
  existingFirstResponseAt: string | null,
  clearTimerPause: boolean,
  pauseContext: Pick<InviteContext, "deadlineAt" | "timerPausedAt"> | null,
): Promise<boolean> {
  const now = new Date();
  const nowIso = now.toISOString();
  const update: {
    status: typeof INVITE_STATUS_ANSWERED;
    first_response_at: string;
    timer_paused_at?: null;
    deadline_at?: string;
  } = {
    status: INVITE_STATUS_ANSWERED,
    first_response_at: existingFirstResponseAt ?? nowIso,
  };
  if (clearTimerPause) {
    update.timer_paused_at = null;
    if (pauseContext?.timerPausedAt && pauseContext.deadlineAt) {
      const deadline = new Date(pauseContext.deadlineAt);
      const pausedAt = new Date(pauseContext.timerPausedAt);
      if (
        !Number.isNaN(deadline.getTime()) &&
        !Number.isNaN(pausedAt.getTime())
      ) {
        update.deadline_at = extendDeadlineByPauseDuration(
          deadline,
          pausedAt,
          now,
        ).toISOString();
      }
    }
  }
  const { error } = await admin
    .from("request_suppliers")
    .update(update)
    .eq("id", requestSupplierId);
  return Boolean(error);
}

async function markRequestHasResponse(
  admin: SupabaseAdminClient,
  requestId: string,
): Promise<boolean> {
  const { error } = await admin
    .from("requests")
    .update({ status: REQUEST_STATUS_HAS_RESPONSE })
    .eq("id", requestId)
    .in("status", [...REQUEST_STATUSES_FIRST_RESPONSE]);
  return Boolean(error);
}

/**
 * Remove a partially inserted version when line insert or admin updates fail.
 * Uses the admin client so CASCADE removes `response_line_items` reliably.
 */
async function rollbackVersion(versionId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("supplier_response_versions")
    .delete()
    .eq("id", versionId);
  if (error) {
    console.error(
      `Откат версии ответа ${versionId} не удался: ${error.message}`,
    );
  }
}
