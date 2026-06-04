import type { KanbanColumnDef } from "@/lib/kanban-config";
import {
  SOURCING_STATUSES,
  SOURCING_STATUS_LABELS,
  isSourcingStatus,
  type SourcingStatus,
} from "@/lib/sourcing";

type BadgeVariant = "muted" | "accent" | "warning" | "success" | "danger";

/** Funnel chain (indices 0..6) for matrix A ±1 moves; excludes `rejected`. */
const SOURCING_CHAIN_STATUSES = SOURCING_STATUSES.filter(
  (status): status is Exclude<SourcingStatus, "rejected"> => status !== "rejected",
);

const SOURCING_STATUS_VARIANTS: Record<SourcingStatus, BadgeVariant> = {
  new: "muted",
  called: "muted",
  clarified: "accent",
  got_price: "accent",
  test_order: "warning",
  approved: "warning",
  working_in_zapros: "success",
  rejected: "danger",
};

function columnForStatus(
  id: string,
  status: SourcingStatus,
  label: string,
  variant: BadgeVariant,
): KanbanColumnDef<SourcingStatus> {
  return { id, status, label, visibleDefault: true, variant };
}

/** Senior procurement supplier board — one column per `supplier_sourcing_status`. */
export const SOURCING_KANBAN_COLUMNS: KanbanColumnDef<SourcingStatus>[] =
  SOURCING_STATUSES.map((status) =>
    columnForStatus(
      status,
      status,
      SOURCING_STATUS_LABELS[status],
      SOURCING_STATUS_VARIANTS[status],
    ),
  );

function chainIndex(status: SourcingStatus): number | null {
  if (status === "rejected") return null;
  const index = SOURCING_CHAIN_STATUSES.indexOf(status);
  return index >= 0 ? index : null;
}

/**
 * Matrix A (Phase 7.6): ±1 along `new → … → working_in_zapros`; any non-rejected
 * → `rejected`; `rejected` → `new` only.
 */
export function isSourcingTransitionAllowed(from: string, to: string): boolean {
  if (!isSourcingStatus(from) || !isSourcingStatus(to)) return false;
  if (from === to) return false;

  if (to === "rejected" && from !== "rejected") return true;
  if (from === "rejected" && to === "new") return true;
  if (from === "rejected" || to === "rejected") return false;

  const fromIdx = chainIndex(from);
  const toIdx = chainIndex(to);
  if (fromIdx === null || toIdx === null) return false;

  return Math.abs(toIdx - fromIdx) === 1;
}

/** Drop targets for a card in column `from` (sourcing kanban). */
export function allowedSourcingDropTargets(from: string): SourcingStatus[] {
  return SOURCING_STATUSES.filter((to) => isSourcingTransitionAllowed(from, to));
}

/** Resolve `suppliers.sourcing_status` for a kanban column id. */
export function sourcingStatusForColumn(columnId: string): SourcingStatus | null {
  const column = SOURCING_KANBAN_COLUMNS.find((col) => col.id === columnId);
  if (!column) return null;
  const status = column.status;
  return typeof status === "string" ? status : (status[0] ?? null);
}
