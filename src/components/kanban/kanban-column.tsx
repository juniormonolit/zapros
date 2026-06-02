"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import type { KanbanColumnDef } from "@/lib/kanban-config";
import { cn } from "@/lib/utils";

interface KanbanColumnProps<TStatus extends string = string> {
  column: KanbanColumnDef<TStatus>;
  count: number;
  children: ReactNode;
  isOver?: boolean;
  emptyHint?: string;
  className?: string;
}

export function KanbanColumn<TStatus extends string = string>({
  column,
  count,
  children,
  isOver,
  emptyHint = "Перетащите карточку сюда",
  className,
}: KanbanColumnProps<TStatus>) {
  return (
    <section
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border border-border-primary bg-bg-muted/30",
        isOver && "ring-2 ring-ring/40",
        className,
      )}
      aria-label={column.label}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border-primary px-3 py-2">
        <Badge variant={column.variant}>{column.label}</Badge>
        <span className="font-mono text-xs text-text-secondary">{count}</span>
      </header>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-2">
        {count === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-text-muted">{emptyHint}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
