import type {
  RequestEventType,
  ResponseSubmittedPayload,
  StatusChangePayload,
} from "@/lib/request-events-types";
import {
  requestStatusPresentation,
  requestSupplierStatusPresentation,
} from "@/lib/request-status";

/** Row for thread UI rendering (loaded on the server, passed to client). */
export interface ThreadEvent {
  id: string;
  requestSupplierId: string;
  eventType: RequestEventType;
  body: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorRole: string;
}

export type ThreadEventVisualKind = "message" | "signal" | "system";

export interface ThreadEventPresentation {
  label: string;
  kind: ThreadEventVisualKind;
}

const MOSCOW_TIMEZONE = "Europe/Moscow";

/** Russian labels for `request_event_type` values. */
export const REQUEST_EVENT_LABELS: Record<RequestEventType, string> = {
  message: "Сообщение",
  signal_cheaper: "Есть дешевле",
  signal_customer_price: "У заказчика дешевле",
  signal_in_progress: "В работе",
  status_change: "Смена статуса",
  request_updated: "Изменение запроса",
  response_submitted: "Отправлен ответ",
};

const SIGNAL_TYPES = new Set<RequestEventType>([
  "signal_cheaper",
  "signal_customer_price",
  "signal_in_progress",
]);

const SYSTEM_TYPES = new Set<RequestEventType>([
  "status_change",
  "request_updated",
  "response_submitted",
]);

/** Presentation metadata for a thread event (label + visual group). */
export function getThreadEventPresentation(
  eventType: RequestEventType,
): ThreadEventPresentation {
  if (SIGNAL_TYPES.has(eventType)) {
    return { label: REQUEST_EVENT_LABELS[eventType], kind: "signal" };
  }
  if (SYSTEM_TYPES.has(eventType)) {
    return { label: REQUEST_EVENT_LABELS[eventType], kind: "system" };
  }
  return { label: REQUEST_EVENT_LABELS[eventType], kind: "message" };
}

/** Format event timestamp in Europe/Moscow (`ru-RU`). */
export function formatEventTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString("ru-RU", {
    timeZone: MOSCOW_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isStatusChangePayload(payload: unknown): payload is StatusChangePayload {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as Record<string, unknown>;
  return (
    typeof row.entity === "string" &&
    typeof row.oldStatus === "string" &&
    typeof row.newStatus === "string"
  );
}

function isResponseSubmittedPayload(
  payload: unknown,
): payload is ResponseSubmittedPayload {
  if (!payload || typeof payload !== "object") return false;
  const row = payload as Record<string, unknown>;
  return (
    typeof row.versionId === "string" &&
    typeof row.versionNumber === "number"
  );
}

/** Human-readable summary for system events in the thread list. */
export function formatThreadEventSummary(event: ThreadEvent): string | null {
  if (event.eventType === "status_change" && isStatusChangePayload(event.payload)) {
    const { entity, oldStatus, newStatus } = event.payload;
    const oldLabel =
      entity === "invite"
        ? requestSupplierStatusPresentation(oldStatus).label
        : requestStatusPresentation(oldStatus).label;
    const newLabel =
      entity === "invite"
        ? requestSupplierStatusPresentation(newStatus).label
        : requestStatusPresentation(newStatus).label;
    const entityLabel = entity === "invite" ? "приглашение" : "запрос";
    return `${entityLabel}: ${oldLabel} → ${newLabel}`;
  }

  if (
    event.eventType === "response_submitted" &&
    isResponseSubmittedPayload(event.payload)
  ) {
    return `Версия ответа № ${event.payload.versionNumber}`;
  }

  if (event.eventType === "message") {
    return event.body;
  }

  return event.body;
}

/** Display name for an event author from profile fields. */
export function formatEventAuthorName(
  fullName: string | null | undefined,
  role: string | null | undefined,
): string {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed;
  if (role === "supplier") return "Поставщик";
  if (role === "procurement" || role === "admin") return "Снабжение";
  return "Участник";
}
