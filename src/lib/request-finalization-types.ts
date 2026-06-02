/**
 * Types and constants for request finalization (F007 / WIN-001).
 * No "use server" — safe to import from tests and UI.
 */

/** DB enum `public.reject_reason`. */
export type RejectReason =
  | "price"
  | "lead_time"
  | "availability"
  | "other_supplier_selected"
  | "customer_cancelled"
  | "no_response"
  | "other";

export const REJECT_REASONS: readonly RejectReason[] = [
  "price",
  "lead_time",
  "availability",
  "other_supplier_selected",
  "customer_cancelled",
  "no_response",
  "other",
] as const;

/** Manual win/reject — procurement picks; not for auto-duplicate cancel. */
export const MANUAL_REJECT_REASONS = new Set<RejectReason>([
  "price",
  "lead_time",
  "availability",
  "customer_cancelled",
  "no_response",
  "other",
]);

/** Russian labels for reject reasons (UI / dialogs). */
export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  price: "Не прошли по цене",
  lead_time: "Не устроили сроки",
  availability: "Нет в наличии / не подошло",
  other_supplier_selected: "Выбран другой поставщик",
  customer_cancelled: "Заказчик отменил",
  no_response: "Без ответа",
  other: "Другое",
};

/** Options for select controls (manual reasons only). */
export const MANUAL_REJECT_REASON_OPTIONS = (
  [...MANUAL_REJECT_REASONS] as RejectReason[]
).map((value) => ({
  value,
  label: REJECT_REASON_LABELS[value],
}));

/** Request statuses that block finalization (already terminal or unusable). */
export const FINALIZED_REQUEST_STATUSES = new Set([
  "won",
  "lost",
  "cancelled",
  "no_response",
]);

/** Non-final sent requests eligible for duplicate auto-cancel scan (excludes draft). */
export const OPEN_REQUEST_STATUSES_FOR_DUPLICATES = new Set([
  "new",
  "awaiting_responses",
  "has_response",
  "clarification",
  "in_progress",
]);

/** Invite statuses that cannot be chosen as winner or changed during finalization. */
export const FINAL_INVITE_STATUSES = new Set(["lost", "won", "no_response"]);

/** Invite statuses implying a supplier has submitted at least one response. */
export const INVITE_STATUSES_WITH_RESPONSE = new Set([
  "answered",
  "under_review",
  "clarification",
  "in_progress",
  "won",
]);

export interface FinalizationInviteRow {
  id: string;
  supplierId: string;
  status: string;
  firstResponseAt: string | null;
}

export interface DuplicateCancelEventPayload {
  kind: "duplicate_cancelled";
  winningRequestId: string;
}
