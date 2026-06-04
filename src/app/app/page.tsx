import Link from "next/link";

import { TasksView } from "@/components/tasks/tasks-view";
import type { TaskListItem } from "@/components/tasks/task-list";
import { buttonVariants } from "@/components/ui/button";
import {
  EMPTY_REQUEST_COUNTS,
  fetchRequestCountsByTask,
  type RequestCounts,
} from "@/lib/request-counters";
import { ensureRows } from "@/lib/db/types";
import { createClient } from "@/lib/app-client";

/**
 * Procurement task list (`/app`). Server Component: loads tasks with the
 * cookie-bound Supabase client and relies on RLS to scope visibility
 * (procurement sees their own tasks, admin sees all). Presentation is
 * delegated to {@link TaskList}.
 */
export default async function ProcurementTasksPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(
      "id, bitrix_task_number, title, deal_title, category, status, created_at",
    )
    .order("created_at", { ascending: false });

  const tasks = ensureRows(data) as unknown as TaskListItem[];

  // One aggregated query for every visible task (no N+1). The view is
  // RLS-scoped, so counters only reflect requests the current user may see.
  const countsByTask = await fetchRequestCountsByTask(
    supabase,
    tasks.map((task) => task.id),
  );
  const requestCounts: Record<string, RequestCounts> = {};
  for (const task of tasks) {
    requestCounts[task.id] = countsByTask.get(task.id) ?? EMPTY_REQUEST_COUNTS;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-text-primary">Задачи</h1>
        <Link href="/app/tasks/new" className={buttonVariants()}>
          Новая задача
        </Link>
      </header>

      <TasksView tasks={tasks} requestCounts={requestCounts} />
    </div>
  );
}
