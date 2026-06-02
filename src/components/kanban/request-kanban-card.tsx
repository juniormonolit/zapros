"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import { KanbanCard } from "@/components/kanban/kanban-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { allowedRequestDropTargets } from "@/lib/kanban-config";
import {
  requestStatusPresentation,
  type RequestStatus,
  type StatusPresentation,
} from "@/lib/request-status";
import { cn } from "@/lib/utils";

export interface RequestKanbanCardItem {
  id: string;
  requestCode: string;
  status: string;
  taskNumber: number | null;
  taskTitle: string | null;
  supplierCount: number;
  deadline: StatusPresentation | null;
}

interface RequestKanbanCardProps {
  item: RequestKanbanCardItem;
  isDragging?: boolean;
  dragHandleProps?: React.ComponentPropsWithoutRef<"button">;
  onMoveTo?: (targetStatus: RequestStatus) => void;
}

function taskLabel(item: RequestKanbanCardItem): string {
  return item.taskTitle?.trim() || "Без названия";
}

export function RequestKanbanCard({
  item,
  isDragging,
  dragHandleProps,
  onMoveTo,
}: RequestKanbanCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const targets = allowedRequestDropTargets(item.status);
  const { label, variant } = requestStatusPresentation(item.status);

  return (
    <KanbanCard isDragging={isDragging} className="relative flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/app/requests/${item.id}`}
          className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="font-mono text-xs text-text-secondary">
            {item.requestCode}
          </span>
          <p className="truncate text-sm font-medium text-text-primary">
            {taskLabel(item)}
          </p>
          {item.taskNumber !== null ? (
            <span className="font-mono text-xs text-text-secondary">
              №&nbsp;{item.taskNumber}
            </span>
          ) : null}
        </Link>

        {onMoveTo && targets.length > 0 ? (
          <div className="relative shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Переместить в…"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal className="size-4" />
            </Button>
            {menuOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10"
                  aria-label="Закрыть меню"
                  onClick={() => setMenuOpen(false)}
                />
                <ul
                  className="absolute top-full right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-border-primary bg-bg-card py-1 shadow-lg"
                  role="menu"
                >
                  {targets.map((status) => (
                    <li key={status} role="none">
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-bg-card-hover"
                        onClick={() => {
                          setMenuOpen(false);
                          onMoveTo(status);
                        }}
                      >
                        {requestStatusPresentation(status).label}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={variant}>{label}</Badge>
        <span className="text-xs text-text-secondary">
          {item.supplierCount}&nbsp;пост.
        </span>
        {item.deadline ? (
          <Badge variant={item.deadline.variant}>{item.deadline.label}</Badge>
        ) : null}
      </div>

      {dragHandleProps ? (
        <button
          type="button"
          className={cn(
            "mt-1 w-full cursor-grab rounded border border-dashed border-border-primary py-1 text-center text-xs text-text-muted active:cursor-grabbing",
          )}
          {...dragHandleProps}
        >
          Перетащить
        </button>
      ) : null}
    </KanbanCard>
  );
}
