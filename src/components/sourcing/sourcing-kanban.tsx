"use client";

import { useMemo, useState } from "react";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import { ProvisionSupplierModal } from "@/components/sourcing/provision-supplier-modal";
import {
  SourcingKanbanCard,
  type SourcingKanbanCardItem,
} from "@/components/sourcing/sourcing-kanban-card";
import { useSourcingKanbanDnd } from "@/components/sourcing/use-sourcing-kanban-dnd";
import { columnStatusKey } from "@/lib/kanban-config";
import { SOURCING_KANBAN_COLUMNS } from "@/lib/sourcing-kanban-config";
import type { SourcingStatus } from "@/lib/sourcing";

interface SourcingKanbanProps {
  items: SourcingKanbanCardItem[];
}

export function SourcingKanban({ items }: SourcingKanbanProps) {
  const [provisionTarget, setProvisionTarget] =
    useState<SourcingKanbanCardItem | null>(null);

  const dnd = useSourcingKanbanDnd({
    onNeedsProvision: (supplierId) => {
      const item = items.find((row) => row.id === supplierId);
      if (item) setProvisionTarget(item);
    },
  });

  const columns = SOURCING_KANBAN_COLUMNS;

  const itemsByColumn = useMemo(() => {
    const map = new Map<SourcingStatus, SourcingKanbanCardItem[]>();
    for (const col of columns) {
      map.set(columnStatusKey(col), []);
    }
    for (const item of items) {
      const status = item.sourcing_status as SourcingStatus;
      const bucket = map.get(status);
      if (bucket) bucket.push(item);
    }
    return map;
  }, [items, columns]);

  const currentStatusById = useMemo(
    () => new Map(items.map((item) => [item.id, item.sourcing_status])),
    [items],
  );

  return (
    <div className="flex flex-col gap-2">
      {dnd.error ? (
        <p className="text-sm text-destructive" role="alert">
          {dnd.error}
        </p>
      ) : null}
      {dnd.isPending ? (
        <p className="text-xs text-text-muted">Обновление стадии…</p>
      ) : null}
      <KanbanBoard<SourcingKanbanCardItem, SourcingStatus>
        columns={columns}
        itemsByColumn={itemsByColumn}
        getItemId={(item) => item.id}
        dnd={dnd}
        currentStatusById={currentStatusById}
        emptyHint="Нет поставщиков в этой колонке"
        renderCard={(item, ctx) => (
          <SourcingKanbanCard
            item={item}
            isDragging={ctx.isDragging}
            dragHandleProps={ctx.dragHandleProps}
            onMoveTo={(target) =>
              dnd.moveToStatus(item.id, item.sourcing_status, target)
            }
          />
        )}
      />
      <ProvisionSupplierModal
        open={provisionTarget !== null}
        onOpenChange={(open) => {
          if (!open) setProvisionTarget(null);
        }}
        supplierId={provisionTarget?.id ?? ""}
        supplierName={provisionTarget?.name ?? ""}
        email={provisionTarget?.email ?? ""}
      />
    </div>
  );
}

export type { SourcingKanbanCardItem };
