"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Badge, type badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMPTY_REQUEST_COUNTS,
  type RequestCounts,
} from "@/lib/request-counters";
import type { VariantProps } from "class-variance-authority";

/** Lifecycle status of a procurement task (enum `public.task_status`). */
export type TaskStatus =
  | "active"
  | "partially_closed"
  | "completed"
  | "archived";

/**
 * Row shape consumed by the list. Mirrors the columns selected on `/app`; kept
 * narrow so the list does not depend on the full `tasks` row.
 */
export interface TaskListItem {
  id: string;
  bitrix_task_number: number;
  title: string | null;
  deal_title: string | null;
  category: string | null;
  status: TaskStatus;
  created_at: string;
}

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

interface StatusPresentation {
  label: string;
  variant: BadgeVariant;
}

/** Maps each task status to its Russian label and badge color token. */
const STATUS_PRESENTATION: Record<TaskStatus, StatusPresentation> = {
  active: { label: "Активна", variant: "accent" },
  partially_closed: { label: "Частично закрыта", variant: "warning" },
  completed: { label: "Завершена", variant: "success" },
  archived: { label: "В архиве", variant: "muted" },
};

/** Tooltip/aria text describing the request counter: завершено / в работе / всего. */
const COUNTER_HINT = "Запросы: завершено / в работе / всего";

/** Best-effort display title: prefer the explicit task title, then deal. */
function displayTitle(task: TaskListItem): string {
  return task.title?.trim() || task.deal_title?.trim() || "Без названия";
}

/**
 * Returns `true` when the task matches the search query. Matches against the
 * Bitrix number (as a string) and the title/deal title (case-insensitive).
 */
function matchesQuery(task: TaskListItem, query: string): boolean {
  const haystacks = [
    String(task.bitrix_task_number),
    task.title ?? "",
    task.deal_title ?? "",
  ];
  return haystacks.some((value) => value.toLowerCase().includes(query));
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const { label, variant } = STATUS_PRESENTATION[status];
  return <Badge variant={variant}>{label}</Badge>;
}

/**
 * Real request counter for a task: завершено / в работе / всего (REQ-008).
 * Counts come from the RLS-scoped `task_request_counters` view via the server
 * component; drafts are excluded (counter is about sent requests, F002).
 */
function RequestCounter({ counts }: { counts: RequestCounts }) {
  const label = `${COUNTER_HINT}: ${counts.completed} / ${counts.inProgress} / ${counts.total}`;
  return (
    <span
      className="font-mono text-sm text-text-secondary"
      title={label}
      aria-label={label}
    >
      {counts.completed} / {counts.inProgress} / {counts.total}
    </span>
  );
}

function EmptyState() {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Пока нет задач</CardTitle>
        <CardDescription>
          Создайте первую задачу, вставив данные из Bitrix.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/app/tasks/new" className={buttonVariants()}>
          Создать задачу
        </Link>
      </CardContent>
    </Card>
  );
}

/** Shown when there are tasks but none match the active search query. */
function NoResults({ query }: { query: string }) {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Ничего не найдено</CardTitle>
        <CardDescription>
          По запросу «{query}» задач нет. Измените номер Bitrix или название.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function TaskRow({
  task,
  counts,
}: {
  task: TaskListItem;
  counts: RequestCounts;
}) {
  return (
    <Link
      href={`/app/tasks/${task.id}`}
      className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-bg-card-hover focus-visible:bg-bg-card-hover focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
    >
      <span className="font-mono text-sm text-text-secondary sm:w-20 sm:shrink-0">
        №&nbsp;{task.bitrix_task_number}
      </span>

      <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
        {displayTitle(task)}
      </span>

      <span className="text-sm text-text-secondary sm:w-40 sm:shrink-0 sm:truncate">
        {task.category ?? "—"}
      </span>

      <span className="sm:w-40 sm:shrink-0">
        <StatusBadge status={task.status} />
      </span>

      <span className="sm:w-28 sm:shrink-0 sm:text-right">
        <RequestCounter counts={counts} />
      </span>
    </Link>
  );
}

/**
 * List of procurement tasks with a client-side search box. Data is loaded by
 * the server component on `/app` (RLS-scoped) and passed in; filtering by
 * Bitrix number / title / deal title happens here without extra round-trips.
 * Each row links to the task card. Renders an empty state with a create CTA
 * when there are no tasks, and a distinct "nothing found" state when a search
 * filters everything out. `requestCounts` maps each task id to its real
 * request counter (REQ-008); missing entries fall back to zeros.
 */
export function TaskList({
  tasks,
  requestCounts = {},
}: {
  tasks: TaskListItem[];
  requestCounts?: Record<string, RequestCounts>;
}) {
  const searchId = useId();
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (normalizedQuery.length === 0) return tasks;
    return tasks.filter((task) => matchesQuery(task, normalizedQuery));
  }, [tasks, normalizedQuery]);

  if (tasks.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Label htmlFor={searchId} className="sr-only">
          Поиск по задачам
        </Label>
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary"
            aria-hidden="true"
          />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по № Bitrix или названию сделки"
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <NoResults query={query.trim()} />
      ) : (
        <Card className="overflow-hidden py-0">
          <ul className="divide-y divide-border-primary">
            {filtered.map((task) => (
              <li key={task.id}>
                <TaskRow
                  task={task}
                  counts={requestCounts[task.id] ?? EMPTY_REQUEST_COUNTS}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
