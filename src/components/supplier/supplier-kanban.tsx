"use client";

import Link from "next/link";
import { useMemo } from "react";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import { KanbanCard } from "@/components/kanban/kanban-card";
import type { SupplierRequestListItem } from "@/components/supplier/supplier-request-list";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  columnStatusKey,
  visibleSupplierKanbanColumns,
} from "@/lib/kanban-config";
import {
  requestSupplierStatusPresentation,
  type RequestSupplierStatus,
} from "@/lib/request-status";

function taskLabel(item: SupplierRequestListItem): string {
  return item.taskTitle?.trim() || "Без названия";
}

function SupplierInviteCard({ item }: { item: SupplierRequestListItem }) {
  const { label, variant } = requestSupplierStatusPresentation(item.inviteStatus);
  return (
    <KanbanCard className="min-h-[100px]">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-xs text-text-secondary">
            {item.requestCode}
          </span>
          <Badge variant={variant}>{label}</Badge>
        </div>
        <p className="line-clamp-2 text-sm font-medium text-text-primary">
          {taskLabel(item)}
        </p>
        {item.taskNumber !== null ? (
          <span className="font-mono text-xs text-text-secondary">
            Bitrix №&nbsp;{item.taskNumber}
          </span>
        ) : null}
        {item.deadline ? (
          <Badge variant={item.deadline.variant}>{item.deadline.label}</Badge>
        ) : null}
        <Link
          href={`/supplier/requests/${item.inviteId}`}
          className={buttonVariants({ size: "sm", className: "w-full" })}
        >
          Открыть
        </Link>
      </div>
    </KanbanCard>
  );
}

interface SupplierKanbanProps {
  items: SupplierRequestListItem[];
  showCompleted: boolean;
}

export function SupplierKanban({ items, showCompleted }: SupplierKanbanProps) {
  const columns = useMemo(
    () => visibleSupplierKanbanColumns(showCompleted),
    [showCompleted],
  );

  const itemsByColumn = useMemo(() => {
    const map = new Map<RequestSupplierStatus, SupplierRequestListItem[]>();
    for (const col of columns) {
      map.set(columnStatusKey(col), []);
    }
    for (const item of items) {
      const bucket = map.get(item.inviteStatus as RequestSupplierStatus);
      if (bucket) bucket.push(item);
    }
    return map;
  }, [items, columns]);

  return (
    <KanbanBoard<SupplierRequestListItem, RequestSupplierStatus>
      columns={columns}
      itemsByColumn={itemsByColumn}
      getItemId={(item) => item.inviteId}
      readOnly
      emptyHint="Нет приглашений"
      renderCard={(item) => <SupplierInviteCard item={item} />}
    />
  );
}
