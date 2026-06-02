"use client";

import { useMemo } from "react";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import {
  RequestKanbanCard,
  type RequestKanbanCardItem,
} from "@/components/kanban/request-kanban-card";
import { useRequestKanbanDnd } from "@/components/kanban/use-request-kanban-dnd";
import type { RequestListItem } from "@/components/requests/request-list";
import {
  columnStatusKey,
  visibleRequestKanbanColumns,
} from "@/lib/kanban-config";
import type { RequestStatus } from "@/lib/request-status";

interface RequestKanbanProps {
  items: RequestListItem[];
  showCompleted: boolean;
}

export function RequestKanban({ items, showCompleted }: RequestKanbanProps) {
  const dnd = useRequestKanbanDnd();
  const columns = useMemo(
    () => visibleRequestKanbanColumns(showCompleted),
    [showCompleted],
  );

  const itemsByColumn = useMemo(() => {
    const map = new Map<RequestStatus, RequestListItem[]>();
    for (const col of columns) {
      map.set(columnStatusKey(col), []);
    }
    for (const item of items) {
      const status = item.status as RequestStatus;
      const bucket = map.get(status);
      if (bucket) bucket.push(item);
    }
    return map;
  }, [items, columns]);

  const currentStatusById = useMemo(
    () => new Map(items.map((item) => [item.id, item.status])),
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
        <p className="text-xs text-text-muted">Обновление статуса…</p>
      ) : null}
      <KanbanBoard<RequestListItem, RequestStatus>
        columns={columns}
        itemsByColumn={itemsByColumn}
        getItemId={(item) => item.id}
        dnd={dnd}
        currentStatusById={currentStatusById}
        emptyHint="Нет запросов в этой колонке"
        renderCard={(item, ctx) => (
          <RequestKanbanCard
            item={item as RequestKanbanCardItem}
            isDragging={ctx.isDragging}
            dragHandleProps={ctx.dragHandleProps}
            onMoveTo={(target) =>
              dnd.moveToStatus(item.id, item.status, target)
            }
          />
        )}
      />
    </div>
  );
}
