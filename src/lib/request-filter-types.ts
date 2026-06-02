import type { RequestStatus } from "@/lib/request-status";

/** Filterable row shape shared by list, kanban, and table views. */
export interface RequestFilterableItem {
  id: string;
  requestCode: string;
  status: string;
  sentAt: string | null;
  createdAt: string | null;
  /** Used for «дата завершения» filter on final statuses; otherwise null. */
  completedAt: string | null;
  taskId: string;
  taskNumber: number | null;
  taskTitle: string | null;
  category: string | null;
  supplierIds: string[];
  supplierCount: number;
}

export type RequestFilterPreset = "in_work" | "custom";

/** Client-side filter state (draft until Apply). */
export interface RequestFilterState {
  preset: RequestFilterPreset;
  /** Empty = all statuses allowed by preset / showCompleted. */
  statuses: RequestStatus[];
  createdFrom: string;
  createdTo: string;
  completedFrom: string;
  completedTo: string;
  category: string;
  bitrixNumber: string;
  supplierIds: string[];
}

export interface RequestFilterOptions {
  categories: string[];
  suppliers: { id: string; label: string }[];
}
