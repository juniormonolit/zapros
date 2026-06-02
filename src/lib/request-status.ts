/**
 * Presentation helpers for request domain statuses and supplier-response
 * deadlines (REQ-007).
 *
 * Maps the DB enums `request_status` and `request_supplier_status`
 * (status-machines.md) to Russian labels and a {@link Badge} color token, and
 * turns a `deadline_at` instant into a "До ответа: N дн." / "Просрочен" badge
 * using the pure math in {@link "@/lib/deadline"}. Kept UI-agnostic (returns
 * plain `{ label, variant }`) so both Server and Client Components can use it.
 */

import type { VariantProps } from "class-variance-authority";

import type { badgeVariants } from "@/components/ui/badge";
import { daysUntilDeadline, isOverdue } from "@/lib/deadline";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

/** Lifecycle status of a whole request (`public.request_status`). */
export type RequestStatus =
  | "draft"
  | "new"
  | "awaiting_responses"
  | "has_response"
  | "clarification"
  | "in_progress"
  | "won"
  | "lost"
  | "no_response"
  | "cancelled";

/** Per-invite status of a supplier (`public.request_supplier_status`). */
export type RequestSupplierStatus =
  | "new"
  | "answered"
  | "under_review"
  | "clarification"
  | "in_progress"
  | "lost"
  | "no_response"
  | "won";

/** A status rendered as a badge: Russian label + color token. */
export interface StatusPresentation {
  label: string;
  variant: BadgeVariant;
}

/** Request status → Russian label and badge color (status-machines.md). */
const REQUEST_STATUS_PRESENTATION: Record<RequestStatus, StatusPresentation> = {
  draft: { label: "Черновик", variant: "muted" },
  new: { label: "Новый", variant: "accent" },
  awaiting_responses: { label: "Ожидаем ответы", variant: "warning" },
  has_response: { label: "Есть ответ", variant: "accent" },
  clarification: { label: "На уточнении", variant: "warning" },
  in_progress: { label: "В работе", variant: "accent" },
  won: { label: "Завершён (победа)", variant: "success" },
  lost: { label: "Не прошли", variant: "danger" },
  no_response: { label: "Без ответа", variant: "muted" },
  cancelled: { label: "Отменён", variant: "muted" },
};

/** Invite status → Russian label and badge color (status-machines.md). */
const REQUEST_SUPPLIER_STATUS_PRESENTATION: Record<
  RequestSupplierStatus,
  StatusPresentation
> = {
  new: { label: "Новый", variant: "accent" },
  answered: { label: "Дан ответ", variant: "accent" },
  under_review: { label: "На рассмотрении", variant: "warning" },
  clarification: { label: "На уточнении", variant: "warning" },
  in_progress: { label: "В работе", variant: "accent" },
  lost: { label: "Не прошли", variant: "danger" },
  no_response: { label: "Без ответа", variant: "muted" },
  won: { label: "Победитель", variant: "success" },
};

/** Fallback used when an unknown status string arrives from the DB. */
function fallback(status: string): StatusPresentation {
  return { label: status, variant: "muted" };
}

/** Presentation for a request status; tolerant of unexpected values. */
export function requestStatusPresentation(status: string): StatusPresentation {
  return REQUEST_STATUS_PRESENTATION[status as RequestStatus] ?? fallback(status);
}

/** Presentation for an invite status; tolerant of unexpected values. */
export function requestSupplierStatusPresentation(
  status: string,
): StatusPresentation {
  return (
    REQUEST_SUPPLIER_STATUS_PRESENTATION[status as RequestSupplierStatus] ??
    fallback(status)
  );
}

/** Ordered list of request statuses for the list filter dropdown. */
export const REQUEST_STATUS_OPTIONS: { value: RequestStatus; label: string }[] =
  (Object.keys(REQUEST_STATUS_PRESENTATION) as RequestStatus[]).map((value) => ({
    value,
    label: REQUEST_STATUS_PRESENTATION[value].label,
  }));

/** Days-remaining threshold below which a deadline badge turns "warning". */
const DEADLINE_SOON_DAYS = 2;

/**
 * Turn a `deadline_at` instant into a badge ("Просрочен" / "Сегодня крайний
 * срок" / "До ответа: N дн."). Returns `null` when there is no/invalid
 * deadline (e.g. a draft invite). `now` is passed in so callers stay
 * deterministic; compute it on the server to avoid hydration drift.
 */
export function describeDeadline(
  deadlineAt: string | null,
  now: Date,
): StatusPresentation | null {
  if (!deadlineAt) return null;
  const deadline = new Date(deadlineAt);
  if (Number.isNaN(deadline.getTime())) return null;

  if (isOverdue(deadline, now)) {
    return { label: "Просрочен", variant: "danger" };
  }

  const days = daysUntilDeadline(deadline, now);
  if (days <= 0) {
    return { label: "Сегодня крайний срок", variant: "warning" };
  }
  return {
    label: `До ответа: ${days} дн.`,
    variant: days <= DEADLINE_SOON_DAYS ? "warning" : "muted",
  };
}
