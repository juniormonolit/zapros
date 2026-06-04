"use client";

import {
  DndContext,
  DragOverlay,
  closestCenter,
  useDroppable,
} from "@dnd-kit/core";
import type { ReactNode } from "react";

import { KanbanDraggableItem } from "@/components/kanban/kanban-draggable-item";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import type { useRequestKanbanDnd } from "@/components/kanban/use-request-kanban-dnd";
import type { KanbanColumnDef } from "@/lib/kanban-config";
import { cn } from "@/lib/utils";

type RequestKanbanDnd = ReturnType<typeof useRequestKanbanDnd>;

/** Shared drag-and-drop handle for procurement and sourcing kanban boards. */
export type KanbanDndHandle<TStatus extends string = string> = Omit<
  RequestKanbanDnd,
  "moveToStatus"
> & {
  moveToStatus: (
    itemId: string,
    fromStatus: string,
    targetStatus: TStatus,
  ) => void;
};

function statusKeyForColumn<TStatus extends string>(
  column: KanbanColumnDef<TStatus>,
): TStatus {
  const status = column.status;
  return (typeof status === "string" ? status : status[0]) as TStatus;
}

interface KanbanBoardProps<TItem, TStatus extends string> {
  columns: KanbanColumnDef<TStatus>[];
  itemsByColumn: Map<TStatus, TItem[]>;
  getItemId: (item: TItem) => string;
  renderCard: (
    item: TItem,
    ctx: {
      isDragging: boolean;
      dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
    },
  ) => ReactNode;
  readOnly?: boolean;
  dnd?: KanbanDndHandle<TStatus>;
  currentStatusById?: Map<string, string>;
  emptyHint?: string;
  className?: string;
}

function DroppableColumn<TStatus extends string>({
  column,
  count,
  children,
  disabled,
  emptyHint,
}: {
  column: KanbanColumnDef<TStatus>;
  count: number;
  children: ReactNode;
  disabled?: boolean;
  emptyHint?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    disabled,
  });

  return (
    <div ref={setNodeRef} className="h-full">
      <KanbanColumn
        column={column}
        count={count}
        isOver={isOver && !disabled}
        emptyHint={emptyHint}
      >
        {children}
      </KanbanColumn>
    </div>
  );
}

export function KanbanBoard<TItem, TStatus extends string>({
  columns,
  itemsByColumn,
  getItemId,
  renderCard,
  readOnly = false,
  dnd,
  currentStatusById,
  emptyHint,
  className,
}: KanbanBoardProps<TItem, TStatus>) {
  const board = (
    <div
      className={cn(
        "flex gap-3 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]",
        className,
      )}
    >
      {columns.map((column) => {
        const statusKey = statusKeyForColumn(column);
        const items = itemsByColumn.get(statusKey) ?? [];
        return (
          <DroppableColumn
            key={column.id}
            column={column}
            count={items.length}
            disabled={readOnly}
            emptyHint={emptyHint}
          >
            {items.map((item) => {
              const itemId = getItemId(item);
              if (readOnly || !dnd) {
                return (
                  <div key={itemId}>
                    {renderCard(item, { isDragging: false })}
                  </div>
                );
              }
              return (
                <KanbanDraggableItem key={itemId} id={itemId}>
                  {({ setActivatorNodeRef, listeners, attributes, isDragging }) => (
                    <div {...attributes}>
                      {renderCard(item, {
                        isDragging,
                        dragHandleProps: {
                          ref: setActivatorNodeRef,
                          ...listeners,
                        } as React.HTMLAttributes<HTMLButtonElement>,
                      })}
                    </div>
                  )}
                </KanbanDraggableItem>
              );
            })}
          </DroppableColumn>
        );
      })}
    </div>
  );

  if (readOnly || !dnd) {
    return board;
  }

  const activeItemId = dnd.activeId;
  let overlay: ReactNode = null;
  if (activeItemId) {
    for (const column of columns) {
        const statusKey = statusKeyForColumn(column);
        const items = itemsByColumn.get(statusKey) ?? [];
      const found = items.find((item) => getItemId(item) === activeItemId);
      if (found) {
        overlay = renderCard(found, { isDragging: true });
        break;
      }
    }
  }

  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={closestCenter}
      onDragStart={dnd.onDragStart}
      onDragEnd={(event) =>
        dnd.onDragEnd(event, currentStatusById ?? new Map())
      }
    >
      {board}
      <DragOverlay>{overlay}</DragOverlay>
    </DndContext>
  );
}
