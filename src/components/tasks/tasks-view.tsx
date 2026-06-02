"use client";

import { LayoutGrid, List } from "lucide-react";
import { useMemo, useState } from "react";

import { TaskKanban } from "@/components/tasks/task-kanban";
import { TaskList, type TaskListItem } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import type { RequestCounts } from "@/lib/request-counters";

const VIEW_STORAGE_KEY = "zapros-tasks-view";

type TasksViewMode = "list" | "kanban";

function loadViewMode(): TasksViewMode {
  if (typeof window === "undefined") return "list";
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return stored === "kanban" ? "kanban" : "list";
}

interface TasksViewProps {
  tasks: TaskListItem[];
  requestCounts: Record<string, RequestCounts>;
}

export function TasksView({ tasks, requestCounts }: TasksViewProps) {
  const [viewMode, setViewMode] = useState<TasksViewMode>(() => loadViewMode());

  const setMode = (mode: TasksViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_STORAGE_KEY, mode);
  };

  const content = useMemo(() => {
    if (viewMode === "kanban") {
      return <TaskKanban tasks={tasks} requestCounts={requestCounts} />;
    }
    return <TaskList tasks={tasks} requestCounts={requestCounts} />;
  }, [viewMode, tasks, requestCounts]);

  if (tasks.length === 0) {
    return <TaskList tasks={tasks} requestCounts={requestCounts} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="inline-flex w-fit rounded-lg border border-border-primary p-0.5"
        role="group"
        aria-label="Режим отображения задач"
      >
        <Button
          type="button"
          size="sm"
          variant={viewMode === "list" ? "secondary" : "ghost"}
          onClick={() => setMode("list")}
        >
          <List className="size-4" />
          Список
        </Button>
        <Button
          type="button"
          size="sm"
          variant={viewMode === "kanban" ? "secondary" : "ghost"}
          onClick={() => setMode("kanban")}
        >
          <LayoutGrid className="size-4" />
          Канбан
        </Button>
      </div>
      {content}
    </div>
  );
}
