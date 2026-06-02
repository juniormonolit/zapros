import Link from "next/link";
import { notFound } from "next/navigation";

import { AddSupplierControl } from "@/components/requests/add-supplier-control";
import { RequestFinalizationControls } from "@/components/requests/request-finalization-controls";
import { ResponseComparisonTable } from "@/components/requests/response-comparison-table";
import { InviteCommunicationPanel } from "@/components/threads/invite-communication-panel";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PaymentForm } from "@/lib/parser/bitrix";
import { parseCashToNoncashRatio } from "@/lib/price-compare";
import { requestStatusPresentation } from "@/lib/request-status";
import { loadThreadEventsByInviteIds } from "@/lib/request-events";
import { loadVersionsForInvites } from "@/lib/response-versions";
import { loadAvailableSuppliers } from "@/lib/suppliers-available";
import { createClient } from "@/lib/supabase/server";

/** Joined parent-task columns for the breadcrumb link and heading. */
interface RequestTaskJoin {
  bitrix_task_number: number | null;
  title: string | null;
  deal_title: string | null;
}

/** Shape of a `requests` row loaded for the detail card (RLS-scoped). */
interface RequestRecord {
  id: string;
  request_code: string;
  status: string;
  payment_form: PaymentForm | null;
  needs_delivery: boolean;
  comment: string | null;
  sent_at: string | null;
  task_id: string;
  tasks: RequestTaskJoin | null;
}

/** A `request_items` snapshot row. */
interface RequestItemRow {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  sort_order: number;
}

/** An invite row joined with the supplier's name. */
interface RequestSupplierRow {
  id: string;
  supplier_id: string;
  status: string;
  sent_at: string | null;
  deadline_at: string | null;
  timer_paused_at: string | null;
  first_response_at: string | null;
  suppliers: { name: string } | null;
}

const PAYMENT_FORM_LABELS: Record<PaymentForm, string> = {
  cash: "Наличные",
  non_cash: "Безналичные",
};

const EMPTY = "—";

/** Human-friendly payment-form label, with a dash fallback for `null`. */
function paymentFormLabel(value: PaymentForm | null): string {
  return value ? PAYMENT_FORM_LABELS[value] : EMPTY;
}

/** Format an ISO timestamp for display, falling back to a dash. */
function formatDateTime(value: string | null): string {
  if (!value) return EMPTY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-text-secondary">{label}</dt>
      <dd className="text-sm text-text-primary">{value}</dd>
    </div>
  );
}

function RequestItemsTable({ items }: { items: RequestItemRow[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-text-secondary">В запросе пока нет позиций.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-table-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-table-header-bg text-text-secondary">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Товар</th>
            <th className="px-3 py-2 text-right font-medium">Кол-во</th>
            <th className="px-3 py-2 text-left font-medium">Ед.</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-t border-table-border bg-table-bg"
            >
              <td className="px-3 py-2 align-top font-medium text-text-primary">
                {item.name}
              </td>
              <td className="px-3 py-2 text-right align-top text-text-primary tabular-nums">
                {item.quantity ?? EMPTY}
              </td>
              <td className="px-3 py-2 align-top text-text-secondary">
                {item.unit ?? EMPTY}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Request detail card (`/app/requests/[id]`). Server Component: loads the
 * request, its item snapshot, supplier invites and response comparison (RSP-008).
 */
export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("requests")
    .select(
      "id, request_code, status, payment_form, needs_delivery, comment, sent_at, task_id, tasks(bitrix_task_number, title, deal_title)",
    )
    .eq("id", id)
    .maybeSingle<RequestRecord>();

  if (!request) {
    notFound();
  }

  const [{ data: itemsData }, { data: invitesData }, { data: ratioSetting }] =
    await Promise.all([
      supabase
        .from("request_items")
        .select("id, name, quantity, unit, sort_order")
        .eq("request_id", id)
        .order("sort_order", { ascending: true }),
      supabase
        .from("request_suppliers")
        .select(
          "id, supplier_id, status, sent_at, deadline_at, timer_paused_at, first_response_at, suppliers!request_suppliers_supplier_id_fkey(name)",
        )
        .eq("request_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "cash_to_noncash_ratio")
        .maybeSingle(),
    ]);

  const items = (itemsData as RequestItemRow[] | null) ?? [];
  const invites = (invitesData as RequestSupplierRow[] | null) ?? [];

  const inviteIds = invites.map((invite) => invite.id);
  const [versionsByInvite, eventsByInvite] = await Promise.all([
    loadVersionsForInvites(supabase, inviteIds),
    loadThreadEventsByInviteIds(supabase, inviteIds),
  ]);
  const cashToNoncashRatio = parseCashToNoncashRatio(ratioSetting?.value);
  const now = new Date();

  const status = requestStatusPresentation(request.status);
  const taskTitle =
    request.tasks?.title ?? request.tasks?.deal_title ?? "Задача";

  // A supplier can only be added once the request has actually been sent;
  // drafts go through the normal send flow instead (REQ-009).
  const isSent = request.status !== "draft" && Boolean(request.sent_at);
  const invitedSupplierIds = invites.map((invite) => invite.supplier_id);
  const availableSuppliers = isSent ? await loadAvailableSuppliers() : null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/app/requests"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← Назад к запросам
        </Link>
        <Link
          href={`/app/tasks/${request.task_id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          К задаче
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="font-mono text-xl">
              {request.request_code}
            </CardTitle>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs font-medium text-text-secondary">
                Задача
              </dt>
              <dd className="text-sm">
                <Link
                  href={`/app/tasks/${request.task_id}`}
                  className="text-accent-primary hover:underline"
                >
                  {taskTitle}
                  {request.tasks?.bitrix_task_number !== null &&
                  request.tasks?.bitrix_task_number !== undefined
                    ? ` (№ ${request.tasks.bitrix_task_number})`
                    : ""}
                </Link>
              </dd>
            </div>
            <FieldRow
              label="Форма оплаты"
              value={paymentFormLabel(request.payment_form)}
            />
            <FieldRow
              label="Доставка"
              value={request.needs_delivery ? "Требуется" : "Не требуется"}
            />
            <FieldRow
              label="Отправлен"
              value={formatDateTime(request.sent_at)}
            />
            <div className="sm:col-span-2">
              <FieldRow
                label="Комментарий"
                value={request.comment?.trim() || EMPTY}
              />
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Позиции</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestItemsTable items={items} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle>Сравнение ответов</CardTitle>
            <div className="flex flex-col items-end gap-3">
              {isSent ? (
                <RequestFinalizationControls
                  requestId={request.id}
                  requestStatus={request.status}
                  invites={invites.map((invite) => ({
                    id: invite.id,
                    supplierName: invite.suppliers?.name ?? "Поставщик",
                    status: invite.status,
                    firstResponseAt: invite.first_response_at,
                  }))}
                />
              ) : null}
              {isSent && availableSuppliers ? (
                <AddSupplierControl
                  requestId={request.id}
                  suppliers={availableSuppliers.suppliers}
                  groups={availableSuppliers.groups}
                  ungroupedSupplierIds={availableSuppliers.ungroupedSupplierIds}
                  invitedSupplierIds={invitedSupplierIds}
                />
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  Добавить поставщика
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponseComparisonTable
            items={items.map((item) => ({
              id: item.id,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
            }))}
            suppliers={invites.map((invite) => ({
              inviteId: invite.id,
              supplierName: invite.suppliers?.name ?? "Поставщик",
              status: invite.status,
              deadlineAt: invite.deadline_at,
              versions: versionsByInvite.get(invite.id) ?? [],
            }))}
            cashToNoncashRatio={cashToNoncashRatio}
            paymentForm={request.payment_form}
            needsDelivery={request.needs_delivery}
            nowIso={now.toISOString()}
          />
        </CardContent>
      </Card>

      {invites.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Переписка с поставщиками</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {invites.map((invite) => (
              <InviteCommunicationPanel
                key={invite.id}
                supplierName={invite.suppliers?.name ?? "Поставщик"}
                requestSupplierId={invite.id}
                inviteStatus={invite.status}
                timerPausedAt={invite.timer_paused_at}
                requestStatus={request.status}
                events={eventsByInvite.get(invite.id) ?? []}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
