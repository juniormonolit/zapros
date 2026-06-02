"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

/** Line status enum mirrored from the `task_items.line_status` DB column. */
export type LineStatus = "free" | "in_request" | "closed" | "rejected";

/** A single task position rendered in the table. */
export interface TaskItemRow {
  id: string;
  sort_order: number;
  name: string;
  quantity: number | null;
  unit: string | null;
  comment: string | null;
  line_status: LineStatus;
}

interface TaskItemsTableProps {
  items: TaskItemRow[];
  /** Owning task id; used to build the "create request" route. */
  taskId: string;
}

interface LineStatusMeta {
  label: string;
  /** Token-based classes for the status badge. */
  className: string;
}

const LINE_STATUS_META: Record<LineStatus, LineStatusMeta> = {
  free: {
    label: "Свободна",
    className: "bg-bg-secondary text-text-secondary border-border-primary",
  },
  in_request: {
    label: "В запросе",
    className: "bg-warning-bg text-warning border-warning-border",
  },
  closed: {
    label: "Закрыта",
    className: "bg-success-bg text-success border-success-border",
  },
  rejected: {
    label: "Отклонена",
    className: "bg-danger-bg text-danger border-danger-border",
  },
};

const CHECKBOX_CLASS =
  "size-4 rounded border-border-strong accent-accent-primary disabled:opacity-50";

function LineStatusBadge({ status }: { status: LineStatus }) {
  const meta = LINE_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

/**
 * Task positions table with row selection that feeds the create-request flow
 * (F002 / REQ-006). Selection state is tracked as a `Set` of `task_items.id`;
 * the "Создать запрос" action navigates to the new-request route, passing the
 * selected ids in the `items` query string, and is enabled once at least one
 * position is checked.
 */
export function TaskItemsTable({ items, taskId }: TaskItemsTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const selectedList = useMemo(
    () => Array.from(selectedIds),
    [selectedIds],
  );

  function toggleOne(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((current) =>
      current.size === items.length
        ? new Set()
        : new Set(items.map((item) => item.id)),
    );
  }

  function handleCreateRequest() {
    if (selectedList.length === 0) return;
    const query = new URLSearchParams({ items: selectedList.join(",") });
    router.push(`/app/tasks/${taskId}/new-request?${query.toString()}`);
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        У задачи пока нет позиций.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-table-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-table-header-bg text-text-secondary">
            <tr>
              <th className="w-10 px-3 py-2 text-left font-medium">
                <input
                  type="checkbox"
                  aria-label="Выбрать все позиции"
                  className={CHECKBOX_CLASS}
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2 text-left font-medium">Товар</th>
              <th className="px-3 py-2 text-right font-medium">Кол-во</th>
              <th className="px-3 py-2 text-left font-medium">Ед.</th>
              <th className="px-3 py-2 text-left font-medium">Комментарий</th>
              <th className="px-3 py-2 text-left font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isSelected = selectedIds.has(item.id);
              return (
                <tr
                  key={item.id}
                  className={`border-t border-table-border ${
                    isSelected ? "bg-table-row-selected" : "bg-table-bg"
                  }`}
                >
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      aria-label={`Выбрать позицию «${item.name}»`}
                      className={CHECKBOX_CLASS}
                      checked={isSelected}
                      onChange={() => toggleOne(item.id)}
                    />
                  </td>
                  <td className="px-3 py-2 align-top font-medium text-text-primary">
                    {item.name}
                  </td>
                  <td className="px-3 py-2 text-right align-top text-text-primary tabular-nums">
                    {item.quantity ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-text-secondary">
                    {item.unit ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top text-text-secondary">
                    {item.comment ?? "—"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <LineStatusBadge status={item.line_status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={handleCreateRequest}
          disabled={selectedIds.size === 0}
        >
          Создать запрос
        </Button>
        <span className="text-sm text-text-secondary">
          Выбрано: {selectedIds.size}
        </span>
      </div>
    </div>
  );
}
