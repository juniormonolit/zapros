import Link from "next/link";
import { notFound } from "next/navigation";

import {
  TaskItemsTable,
  type TaskItemRow,
} from "@/components/tasks/task-items-table";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PaymentForm } from "@/lib/parser/bitrix";
import { ensureRow, ensureRows } from "@/lib/db/types";
import { fetchRequestCountsForTask } from "@/lib/request-counters";
import { createClient } from "@/lib/app-client";

/** Shape of a `tasks` row loaded for the detail card (RLS-scoped). */
interface TaskRecord {
  id: string;
  bitrix_task_number: number | null;
  bitrix_url: string | null;
  title: string | null;
  manager_name: string | null;
  delivery_address: string | null;
  purposes: string | null;
  payment_form: PaymentForm | null;
  delivery_date: string | null;
  category: string | null;
  deal_title: string | null;
  requested_at: string | null;
  status: string | null;
  created_at: string | null;
}

const PAYMENT_FORM_LABELS: Record<PaymentForm, string> = {
  cash: "Наличные",
  non_cash: "Безналичные",
};

/** Russian labels for `public.task_status`, matching the list view. */
const TASK_STATUS_LABELS: Record<string, string> = {
  active: "Активна",
  partially_closed: "Частично закрыта",
  completed: "Завершена",
  archived: "В архиве",
};

const EMPTY = "—";

/** Human-friendly payment-form label, with a dash fallback for `null`. */
function paymentFormLabel(value: PaymentForm | null): string {
  return value ? PAYMENT_FORM_LABELS[value] : EMPTY;
}

/** Format an ISO date / timestamp for display, falling back to a dash. */
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

/** Format an ISO date (no time) for display, falling back to a dash. */
function formatDate(value: string | null): string {
  if (!value) return EMPTY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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

/**
 * Task detail card. Server Component: loads the task and its line items under
 * RLS (a procurement specialist sees only their own tasks, admins see all).
 * A missing task — or one the current user may not access — renders `notFound()`.
 */
export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: taskData } = await supabase
    .from("tasks")
    .select(
      "id, bitrix_task_number, bitrix_url, title, manager_name, delivery_address, purposes, payment_form, delivery_date, category, deal_title, requested_at, status, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  const task = ensureRow(taskData) as unknown as TaskRecord | null;
  if (!task) {
    notFound();
  }

  const { data: itemsData } = await supabase
    .from("task_items")
    .select("id, sort_order, name, quantity, unit, comment, line_status")
    .eq("task_id", id)
    .order("sort_order", { ascending: true });

  const items = ensureRows(itemsData) as unknown as TaskItemRow[];

  // Real request counter (REQ-008): RLS-scoped, drafts excluded (F002).
  const requestCounts = await fetchRequestCountsForTask(supabase, task.id);

  const heading = task.title ?? task.deal_title ?? "Задача";
  const hasBitrixUrl = Boolean(task.bitrix_url);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/app"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← Назад к задачам
        </Link>
        {hasBitrixUrl ? (
          <a
            href={task.bitrix_url ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Открыть в Bitrix
          </a>
        ) : (
          <span className="text-xs text-text-muted">
            Ссылка на Bitrix не задана
          </span>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="text-xl">{heading}</CardTitle>
            {task.status ? (
              <span className="inline-flex items-center rounded-full border border-border-primary bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">
                {TASK_STATUS_LABELS[task.status] ?? task.status}
              </span>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldRow
              label="№ Bitrix"
              value={
                task.bitrix_task_number !== null
                  ? String(task.bitrix_task_number)
                  : EMPTY
              }
            />
            <FieldRow label="Категория" value={task.category ?? EMPTY} />
            <FieldRow label="Менеджер" value={task.manager_name ?? EMPTY} />
            <FieldRow
              label="Адрес доставки"
              value={task.delivery_address ?? EMPTY}
            />
            <FieldRow
              label="Форма оплаты"
              value={paymentFormLabel(task.payment_form)}
            />
            <FieldRow
              label="Дата поставки"
              value={formatDate(task.delivery_date)}
            />
            <FieldRow
              label="Запрос снабженцу"
              value={formatDateTime(task.requested_at)}
            />
            <FieldRow
              label="Запросы (завершено / в работе / всего)"
              value={`${requestCounts.completed} / ${requestCounts.inProgress} / ${requestCounts.total}`}
            />
            <FieldRow label="Цель" value={task.purposes ?? EMPTY} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Позиции</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskItemsTable items={items} taskId={task.id} />
        </CardContent>
      </Card>
    </div>
  );
}
