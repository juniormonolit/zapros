import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ResponseForm,
  type ResponseFormItem,
} from "@/components/supplier/response-form";
import { VersionHistory } from "@/components/responses/version-history";
import { RequestThread } from "@/components/threads/request-thread";
import { SupplierClarificationBanner } from "@/components/threads/supplier-clarification-banner";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { PaymentForm } from "@/lib/parser/bitrix";
import { THREAD_ACTIVE_INVITE_STATUSES } from "@/lib/request-events-helpers";
import { loadThreadEvents } from "@/lib/request-events";
import { loadVersionsForInvite } from "@/lib/response-versions";
import {
  describeDeadline,
  requestSupplierStatusPresentation,
} from "@/lib/request-status";
import { createClient } from "@/lib/supabase/server";

/** Invite statuses that block new response submissions. */
const FINAL_INVITE_STATUSES = new Set(["lost", "won", "no_response"]);

const HIDDEN_REQUEST_STATUSES = new Set(["draft", "cancelled"]);

const PAYMENT_FORM_LABELS: Record<PaymentForm, string> = {
  cash: "Наличные",
  non_cash: "Безналичные",
};

interface RequestTaskJoin {
  bitrix_task_number: number | null;
  title: string | null;
  deal_title: string | null;
}

interface RequestJoin {
  id: string;
  request_code: string;
  status: string;
  payment_form: PaymentForm | null;
  needs_delivery: boolean;
  sent_at: string | null;
  tasks: RequestTaskJoin | null;
}

interface InviteRow {
  id: string;
  status: string;
  sent_at: string | null;
  deadline_at: string | null;
  timer_paused_at: string | null;
  requests: RequestJoin | RequestJoin[] | null;
}

interface RequestItemRow {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  sort_order: number;
}

function unwrapRequest(
  requests: RequestJoin | RequestJoin[] | null,
): RequestJoin | null {
  if (!requests) return null;
  return Array.isArray(requests) ? (requests[0] ?? null) : requests;
}

function isAccessibleInvite(row: InviteRow, request: RequestJoin): boolean {
  if (HIDDEN_REQUEST_STATUSES.has(request.status)) return false;
  if (request.sent_at == null) return false;
  if (row.sent_at == null) return false;
  return true;
}

/**
 * Supplier response page (`/supplier/requests/[inviteId]`). Loads the invite,
 * parent request, item snapshot, and version history under RLS; renders the
 * response form or a read-only message when the invite is final.
 */
export default async function SupplierResponsePage({
  params,
}: {
  params: Promise<{ inviteId: string }>;
}) {
  const { inviteId } = await params;
  const supabase = await createClient();

  const { data: inviteRow } = await supabase
    .from("request_suppliers")
    .select(
      "id, status, sent_at, deadline_at, timer_paused_at, requests!request_suppliers_request_id_fkey(id, request_code, status, payment_form, needs_delivery, sent_at, tasks(bitrix_task_number, title, deal_title))",
    )
    .eq("id", inviteId)
    .maybeSingle<InviteRow>();

  const request = unwrapRequest(inviteRow?.requests ?? null);
  if (!inviteRow || !request || !isAccessibleInvite(inviteRow, request)) {
    notFound();
  }

  const [{ data: itemsData }, versions, threadEvents] = await Promise.all([
    supabase
      .from("request_items")
      .select("id, name, quantity, unit, sort_order")
      .eq("request_id", request.id)
      .order("sort_order", { ascending: true }),
    loadVersionsForInvite(supabase, inviteId),
    loadThreadEvents(supabase, inviteId),
  ]);

  const items: ResponseFormItem[] = (
    (itemsData as RequestItemRow[] | null) ?? []
  ).map((row) => ({
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
  }));

  const now = new Date();
  const inviteStatus = requestSupplierStatusPresentation(inviteRow.status);
  const deadline = describeDeadline(inviteRow.deadline_at, now);
  const submitBlocked = FINAL_INVITE_STATUSES.has(inviteRow.status);
  const threadReadOnly =
    submitBlocked || !THREAD_ACTIVE_INVITE_STATUSES.has(inviteRow.status);
  const taskTitle =
    request.tasks?.title ?? request.tasks?.deal_title ?? "Запрос";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/supplier"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← К моим запросам
        </Link>
      </div>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold text-text-primary">
            Ответ на запрос
          </h1>
          <Badge variant="muted" className="font-mono">
            {request.request_code}
          </Badge>
        </div>
        <p className="text-sm text-text-secondary">{taskTitle}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={inviteStatus.variant}>{inviteStatus.label}</Badge>
          {deadline ? (
            <Badge variant={deadline.variant}>{deadline.label}</Badge>
          ) : null}
          <span className="text-text-secondary">
            Оплата:{" "}
            {request.payment_form
              ? PAYMENT_FORM_LABELS[request.payment_form]
              : "—"}
            {request.needs_delivery ? " · с доставкой" : " · самовывоз"}
          </span>
        </div>
      </header>

      <SupplierClarificationBanner
        inviteStatus={inviteRow.status}
        timerPausedAt={inviteRow.timer_paused_at}
      />

      {versions.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-xl border border-border-primary bg-bg-card p-4">
          <h2 className="text-sm font-medium text-text-primary">
            История ответов
          </h2>
          <VersionHistory
            versions={versions}
            paymentForm={request.payment_form}
            needsDelivery={request.needs_delivery}
          />
        </section>
      ) : null}

      <ResponseForm
        inviteId={inviteId}
        requestCode={request.request_code}
        paymentForm={request.payment_form}
        needsDelivery={request.needs_delivery}
        items={items}
        submitBlocked={submitBlocked}
        blockedMessage={
          submitBlocked
            ? "На этом приглашении больше нельзя отправлять ответ."
            : null
        }
        hasPriorVersions={versions.length > 0}
      />

      <section className="flex flex-col gap-3 rounded-xl border border-border-primary bg-bg-card p-4">
        <h2 className="text-sm font-medium text-text-primary">Переписка</h2>
        <RequestThread
          requestSupplierId={inviteId}
          role="supplier"
          events={threadEvents}
          readOnly={threadReadOnly}
        />
      </section>
    </div>
  );
}
