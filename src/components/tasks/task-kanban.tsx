"use client";

import Link from "next/link";
import { useMemo } from "react";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import { KanbanCard } from "@/components/kanban/kanban-card";
import { Badge } from "@/components/ui/badge";
import {
  EMPTY_REQUEST_COUNTS,
  type RequestCounts,
} from "@/lib/request-counters";
import {
  TASK_KANBAN_COLUMNS,
  columnStatusKey,
  type TaskKanbanStatus,
} from "@/lib/kanban-config";
import type { TaskListItem } from "@/components/tasks/task-list";
import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const STATUS_PRESENTATION: Record<
  TaskKanbanStatus,
  { label: string; variant: BadgeVariant }
> = {
  active: { label: "Активна", variant: "accent" },
  partially_closed: { label: "Частично закрыта", variant: "warning" },
  completed: { label: "Завершена", variant: "success" },
  archived: { label: "В архиве", variant: "muted" },
};

const COUNTER_HINT = "Запросы: завершено / в работе / всего";

function displayTitle(task: TaskListItem): string {
  return task.title?.trim() || task.deal_title?.trim() || "Без названия";
}

function RequestCounter({ counts }: { counts: RequestCounts }) {
  const label = `${COUNTER_HINT}: ${counts.completed} / ${counts.inProgress} / ${counts.total}`;
  return (
    <span
      className="font-mono text-xs text-text-secondary"
      title={label}
      aria-label={label}
    >
      {counts.completed} / {counts.inProgress} / {counts.total}
    </span>
  );
}

function TaskKanbanCard({
  task,
  counts,
}: {
  task: TaskListItem;
  counts: RequestCounts;
}) {
  const { label, variant } =
    STATUS_PRESENTATION[task.status as TaskKanbanStatus];
  return (
    <KanbanCard className="min-h-[88px]">
      <Link
        href={`/app/tasks/${task.id}`}
        className="flex flex-col gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-xs text-text-secondary">
            №&nbsp;{task.bitrix_task_number}
          </span>
          <Badge variant={variant}>{label}</Badge>
        </div>
        <p className="line-clamp-2 text-sm font-medium text-text-primary">
          {displayTitle(task)}
        </p>
        <p className="truncate text-xs text-text-secondary">
          {task.category ?? "—"}
        </p>
        <RequestCounter counts={counts} />
      </Link>
    </KanbanCard>
  );
}

interface TaskKanbanProps {
  tasks: TaskListItem[];
  requestCounts: Record<string, RequestCounts>;
}

export function TaskKanban({ tasks, requestCounts }: TaskKanbanProps) {
  const itemsByColumn = useMemo(() => {
    const map = new Map<TaskKanbanStatus, TaskListItem[]>();
    for (const col of TASK_KANBAN_COLUMNS) {
      map.set(columnStatusKey(col), []);
    }
    for (const task of tasks) {
      const bucket = map.get(task.status as TaskKanbanStatus);
      if (bucket) bucket.push(task);
    }
    return map;
  }, [tasks]);

  return (
    <KanbanBoard<TaskListItem, TaskKanbanStatus>
      columns={TASK_KANBAN_COLUMNS}
      itemsByColumn={itemsByColumn}
      getItemId={(task) => task.id}
      readOnly
      emptyHint="Нет задач"
      renderCard={(task) => (
        <TaskKanbanCard
          task={task}
          counts={requestCounts[task.id] ?? EMPTY_REQUEST_COUNTS}
        />
      )}
    />
  );
}
