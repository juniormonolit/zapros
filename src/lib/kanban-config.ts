import type {
  RequestFilterableItem,
  RequestFilterState,
} from "@/lib/request-filter-types";
import {
  REQUEST_STATUS_OPTIONS,
  requestStatusPresentation,
  requestSupplierStatusPresentation,
  type RequestStatus,
  type RequestSupplierStatus,
} from "@/lib/request-status";

export type { RequestSupplierStatus };

type BadgeVariant = "muted" | "accent" | "warning" | "success" | "danger";

/** Column definition shared by procurement and supplier kanban boards. */
export interface KanbanColumnDef<TStatus extends string = string> {
  id: string;
  status: TStatus | readonly TStatus[];
  label: string;
  visibleDefault: boolean;
  variant: BadgeVariant;
}

/** Statuses shown on the request kanban by default (F005). */
export const REQUEST_KANBAN_VISIBLE_STATUSES = [
  "new",
  "awaiting_responses",
  "has_response",
  "clarification",
  "in_progress",
] as const satisfies readonly RequestStatus[];

/** Final / terminal request statuses hidden until «Показать завершённые». */
export const REQUEST_KANBAN_HIDDEN_STATUSES = [
  "lost",
  "won",
  "no_response",
  "cancelled",
] as const satisfies readonly RequestStatus[];

/** Default multiselect / stage group «Запрос в работе» (status-machines.md). */
export const REQUEST_FILTER_PRESET_IN_WORK: readonly RequestStatus[] = [
  "new",
  "awaiting_responses",
  "has_response",
  "clarification",
  "in_progress",
];

const WORKING_REQUEST_STATUSES = new Set<string>(REQUEST_KANBAN_VISIBLE_STATUSES);

/** Targets rejected by manual DnD and {@link updateRequestStatus} (Phase 6). */
export const FORBIDDEN_MANUAL_REQUEST_TARGETS = new Set<RequestStatus>([
  "draft",
  "won",
  "lost",
  "no_response",
  "cancelled",
]);

/**
 * Manual transition matrix (Phase 6): any working status may move to any other
 * working status except staying in the same column.
 */
const MANUAL_REQUEST_TRANSITIONS: Readonly<
  Record<(typeof REQUEST_KANBAN_VISIBLE_STATUSES)[number], readonly RequestStatus[]>
> = {
  new: ["awaiting_responses", "has_response", "clarification", "in_progress"],
  awaiting_responses: ["new", "has_response", "clarification", "in_progress"],
  has_response: ["new", "awaiting_responses", "clarification", "in_progress"],
  clarification: ["new", "awaiting_responses", "has_response", "in_progress"],
  in_progress: ["new", "awaiting_responses", "has_response", "clarification"],
};

function columnForStatus<TStatus extends string>(
  id: string,
  status: TStatus,
  visibleDefault: boolean,
  label: string,
  variant: BadgeVariant,
): KanbanColumnDef<TStatus> {
  return { id, status, label, visibleDefault, variant };
}

/** Procurement request board columns (one status per column). */
export const REQUEST_KANBAN_COLUMNS: KanbanColumnDef<RequestStatus>[] = [
  ...REQUEST_KANBAN_VISIBLE_STATUSES.map((status) =>
    columnForStatus(
      status,
      status,
      true,
      requestStatusPresentation(status).label,
      requestStatusPresentation(status).variant,
    ),
  ),
  ...REQUEST_KANBAN_HIDDEN_STATUSES.map((status) =>
    columnForStatus(
      status,
      status,
      false,
      requestStatusPresentation(status).label,
      requestStatusPresentation(status).variant,
    ),
  ),
];

/** Lifecycle status of a procurement task (`public.task_status`). */
export type TaskKanbanStatus =
  | "active"
  | "partially_closed"
  | "completed"
  | "archived";

const TASK_STATUS_LABELS: Record<
  TaskKanbanStatus,
  { label: string; variant: BadgeVariant }
> = {
  active: { label: "Активна", variant: "accent" },
  partially_closed: { label: "Частично закрыта", variant: "warning" },
  completed: { label: "Завершена", variant: "success" },
  archived: { label: "В архиве", variant: "muted" },
};

/** Procurement task board columns (`tasks.status`). */
export const TASK_KANBAN_COLUMNS: KanbanColumnDef<TaskKanbanStatus>[] = (
  Object.keys(TASK_STATUS_LABELS) as TaskKanbanStatus[]
).map((status) => {
  const { label, variant } = TASK_STATUS_LABELS[status];
  return columnForStatus(status, status, true, label, variant);
});

/** Supplier invite statuses shown by default on `/supplier`. */
export const SUPPLIER_KANBAN_VISIBLE_STATUSES = [
  "new",
  "answered",
  "under_review",
  "clarification",
  "in_progress",
] as const satisfies readonly RequestSupplierStatus[];

/** Hidden until «Показать завершённые» on the supplier board. */
export const SUPPLIER_KANBAN_HIDDEN_STATUSES = [
  "lost",
  "no_response",
] as const satisfies readonly RequestSupplierStatus[];

/** Supplier invite board columns (`request_suppliers.status`). */
export const SUPPLIER_KANBAN_COLUMNS: KanbanColumnDef<RequestSupplierStatus>[] = [
  ...SUPPLIER_KANBAN_VISIBLE_STATUSES.map((status) =>
    columnForStatus(
      status,
      status,
      true,
      requestSupplierStatusPresentation(status).label,
      requestSupplierStatusPresentation(status).variant,
    ),
  ),
  ...SUPPLIER_KANBAN_HIDDEN_STATUSES.map((status) =>
    columnForStatus(
      status,
      status,
      false,
      requestSupplierStatusPresentation(status).label,
      requestSupplierStatusPresentation(status).variant,
    ),
  ),
];

/** Whether `target` is allowed for manual request status change (DnD / action). */
export function isManualRequestTransition(
  from: string,
  to: string,
): boolean {
  if (from === to) return false;
  if (FORBIDDEN_MANUAL_REQUEST_TARGETS.has(to as RequestStatus)) return false;
  if (!WORKING_REQUEST_STATUSES.has(from) || !WORKING_REQUEST_STATUSES.has(to)) {
    return false;
  }
  const allowed =
    MANUAL_REQUEST_TRANSITIONS[from as keyof typeof MANUAL_REQUEST_TRANSITIONS];
  return allowed?.includes(to as RequestStatus) ?? false;
}

/** Drop targets for a card sitting in column `from` (procurement request kanban). */
export function allowedRequestDropTargets(from: string): RequestStatus[] {
  if (!WORKING_REQUEST_STATUSES.has(from)) return [];
  return [
    ...(MANUAL_REQUEST_TRANSITIONS[
      from as keyof typeof MANUAL_REQUEST_TRANSITIONS
    ] ?? []),
  ];
}

function parseDayStart(isoDate: string): number | null {
  const time = new Date(`${isoDate}T00:00:00.000Z`).getTime();
  return Number.isNaN(time) ? null : time;
}

function parseDayEnd(isoDate: string): number | null {
  const time = new Date(`${isoDate}T23:59:59.999Z`).getTime();
  return Number.isNaN(time) ? null : time;
}

function withinRange(
  iso: string | null | undefined,
  from: string,
  to: string,
): boolean {
  if (!from.trim() && !to.trim()) return true;
  if (!iso) return false;
  const instant = new Date(iso).getTime();
  if (Number.isNaN(instant)) return false;
  if (from) {
    const start = parseDayStart(from);
    if (start !== null && instant < start) return false;
  }
  if (to) {
    const end = parseDayEnd(to);
    if (end !== null && instant > end) return false;
  }
  return true;
}

function matchesBitrix(
  taskNumber: number | null | undefined,
  query: string,
): boolean {
  if (!query.trim()) return true;
  if (taskNumber === null || taskNumber === undefined) return false;
  return String(taskNumber).includes(query.trim());
}

function matchesSuppliers(
  rowSupplierIds: string[] | undefined,
  filterIds: string[],
): boolean {
  if (filterIds.length === 0) return true;
  if (!rowSupplierIds || rowSupplierIds.length === 0) return false;
  const filterSet = new Set(filterIds);
  return rowSupplierIds.some((id) => filterSet.has(id));
}

function matchesStatusFilter(
  status: string,
  filters: RequestFilterState,
): boolean {
  if (filters.statuses.length > 0) {
    return filters.statuses.includes(status as RequestStatus);
  }
  if (filters.preset === "in_work") {
    return (REQUEST_FILTER_PRESET_IN_WORK as readonly string[]).includes(status);
  }
  return true;
}

/**
 * Pure client-side filter for request rows (list, kanban, table). Drafts are
 * always excluded (not shown on boards). When `showCompleted` is false, rows in
 * {@link REQUEST_KANBAN_HIDDEN_STATUSES} are excluded unless explicitly selected
 * via `filters.statusIds`.
 */
export function filterRequestByState(
  item: RequestFilterableItem,
  filters: RequestFilterState,
  showCompleted: boolean,
): boolean {
  if (item.status === "draft") return false;

  const isHiddenFinal = (REQUEST_KANBAN_HIDDEN_STATUSES as readonly string[]).includes(
    item.status,
  );
  if (isHiddenFinal && !showCompleted && filters.statuses.length === 0) {
    return false;
  }

  if (!matchesStatusFilter(item.status, filters)) return false;

  if (
    filters.category.trim() &&
    item.category?.trim().toLowerCase() !== filters.category.trim().toLowerCase()
  ) {
    return false;
  }

  if (!matchesBitrix(item.taskNumber, filters.bitrixNumber)) return false;
  if (!matchesSuppliers(item.supplierIds, filters.supplierIds)) return false;
  if (!withinRange(item.createdAt, filters.createdFrom, filters.createdTo)) {
    return false;
  }
  if (
    !withinRange(item.completedAt, filters.completedFrom, filters.completedTo)
  ) {
    return false;
  }

  return true;
}

/** Status multiselect options (excludes draft; labels from `request-status.ts`). */
export const REQUEST_STATUS_FILTER_OPTIONS = REQUEST_STATUS_OPTIONS.filter(
  (option) => option.value !== "draft",
);

/** Initial filter state: preset «Запрос в работе», hide completed finals. */
export function defaultRequestFilters(): RequestFilterState {
  return {
    preset: "in_work",
    statuses: [...REQUEST_FILTER_PRESET_IN_WORK],
    createdFrom: "",
    createdTo: "",
    completedFrom: "",
    completedTo: "",
    category: "",
    bitrixNumber: "",
    supplierIds: [],
  };
}

/** Reset draft/applied filters to the in-work stage group. */
export function applyPresetInWork(): RequestFilterState {
  return defaultRequestFilters();
}

/** Single status key for a column definition or raw status value. */
export function columnStatusKey<TStatus extends string>(
  column: KanbanColumnDef<TStatus>,
): TStatus;
export function columnStatusKey<TStatus extends string>(
  status: TStatus | readonly TStatus[],
): TStatus;
export function columnStatusKey<TStatus extends string>(
  input: KanbanColumnDef<TStatus> | TStatus | readonly TStatus[],
): TStatus {
  const status =
    typeof input === "object" && input !== null && "status" in input
      ? input.status
      : input;
  return (typeof status === "string" ? status : status[0]) as TStatus;
}

/** Columns rendered on the request kanban (optionally includes hidden finals). */
export function visibleRequestKanbanColumns(
  showCompleted: boolean,
): KanbanColumnDef<RequestStatus>[] {
  return REQUEST_KANBAN_COLUMNS.filter(
    (col) => col.visibleDefault || showCompleted,
  ) as KanbanColumnDef<RequestStatus>[];
}

/** Columns rendered on the supplier invite kanban. */
export function visibleSupplierKanbanColumns(
  showCompleted: boolean,
): KanbanColumnDef<RequestSupplierStatus>[] {
  return SUPPLIER_KANBAN_COLUMNS.filter(
    (col) => col.visibleDefault || showCompleted,
  ) as KanbanColumnDef<RequestSupplierStatus>[];
}

/** Resolve a single `requests.status` value for a kanban column id. */
export function requestStatusForColumn(columnId: string): RequestStatus | null {
  const column = REQUEST_KANBAN_COLUMNS.find((col) => col.id === columnId);
  if (!column) return null;
  const status = column.status;
  return typeof status === "string" ? status : status[0] ?? null;
}
