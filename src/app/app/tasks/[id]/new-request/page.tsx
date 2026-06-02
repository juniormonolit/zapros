import Link from "next/link";
import { notFound } from "next/navigation";

import {
  CreateRequestForm,
  type RequestItemOption,
} from "@/components/requests/create-request-form";
import { buttonVariants } from "@/components/ui/button";
import { getProfile } from "@/lib/auth";
import type { PaymentForm } from "@/lib/parser/bitrix";
import { loadAvailableSuppliers } from "@/lib/suppliers-available";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Создать запрос",
};

/** Roles allowed to create a request (mirrors `REQUEST_AUTHORS` in actions). */
const REQUEST_AUTHORS = new Set(["procurement", "admin"]);

/** Shape of the `tasks` row needed to seed the request draft. */
interface TaskRecord {
  id: string;
  title: string | null;
  deal_title: string | null;
  payment_form: PaymentForm | null;
}

/** Parse the `items` query param (comma-separated ids) into a clean list. */
function parseItemIds(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Create-request route (REQ-006). Server Component: validates the role and task
 * ownership (the latter via RLS — a task the user cannot read renders
 * `notFound()`), then loads the task, its positions and the selectable
 * suppliers, and hands everything to the client wizard. Positions checked on the
 * task card arrive via the `items` query string and pre-select the selection.
 */
export default async function NewRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ items?: string | string[] }>;
}) {
  const { id } = await params;
  const { items: itemsParam } = await searchParams;

  const profile = await getProfile();
  if (!profile || !REQUEST_AUTHORS.has(profile.role)) {
    notFound();
  }

  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("id, title, deal_title, payment_form")
    .eq("id", id)
    .maybeSingle<TaskRecord>();

  if (!task) {
    notFound();
  }

  const { data: itemsData } = await supabase
    .from("task_items")
    .select("id, name, quantity, unit")
    .eq("task_id", id)
    .order("sort_order", { ascending: true });

  const items = (itemsData as RequestItemOption[] | null) ?? [];
  const { suppliers, groups, ungroupedSupplierIds } =
    await loadAvailableSuppliers();

  const heading = task.title ?? task.deal_title ?? "Задача";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <Link
          href={`/app/tasks/${id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          ← Назад к задаче
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-text-primary">
          Создать запрос
        </h1>
        <p className="text-sm text-text-secondary">{heading}</p>
      </div>

      <CreateRequestForm
        taskId={id}
        paymentForm={task.payment_form}
        items={items}
        initialSelectedItemIds={parseItemIds(itemsParam)}
        suppliers={suppliers}
        groups={groups}
        ungroupedSupplierIds={ungroupedSupplierIds}
      />
    </div>
  );
}
