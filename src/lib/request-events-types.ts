/**
 * Shared constants and types for `request_events` (no "use server").
 * DB enum: `public.request_event_type`.
 */

export const REQUEST_EVENT_MESSAGE = "message" as const;
export const REQUEST_EVENT_SIGNAL_CHEAPER = "signal_cheaper" as const;
export const REQUEST_EVENT_SIGNAL_CUSTOMER_PRICE = "signal_customer_price" as const;
export const REQUEST_EVENT_SIGNAL_IN_PROGRESS = "signal_in_progress" as const;
export const REQUEST_EVENT_STATUS_CHANGE = "status_change" as const;
export const REQUEST_EVENT_REQUEST_UPDATED = "request_updated" as const;
export const REQUEST_EVENT_RESPONSE_SUBMITTED = "response_submitted" as const;

/** All values of `public.request_event_type`. */
export type RequestEventType =
  | typeof REQUEST_EVENT_MESSAGE
  | typeof REQUEST_EVENT_SIGNAL_CHEAPER
  | typeof REQUEST_EVENT_SIGNAL_CUSTOMER_PRICE
  | typeof REQUEST_EVENT_SIGNAL_IN_PROGRESS
  | typeof REQUEST_EVENT_STATUS_CHANGE
  | typeof REQUEST_EVENT_REQUEST_UPDATED
  | typeof REQUEST_EVENT_RESPONSE_SUBMITTED;

/** Quick-signal types accepted by {@link postQuickSignal}. */
export type QuickSignalType =
  | typeof REQUEST_EVENT_SIGNAL_CHEAPER
  | typeof REQUEST_EVENT_SIGNAL_CUSTOMER_PRICE
  | typeof REQUEST_EVENT_SIGNAL_IN_PROGRESS;

export const QUICK_SIGNAL_TYPES = new Set<QuickSignalType>([
  REQUEST_EVENT_SIGNAL_CHEAPER,
  REQUEST_EVENT_SIGNAL_CUSTOMER_PRICE,
  REQUEST_EVENT_SIGNAL_IN_PROGRESS,
]);

export const MAX_EVENT_BODY_LENGTH = 4000;

/** Discriminated result for thread / clarification server actions. */
export type EventActionResult =
  | { ok: true }
  | { ok: false; error: string };

export interface StatusChangePayload {
  entity: "invite" | "request";
  oldStatus: string;
  newStatus: string;
}

export interface ResponseSubmittedPayload {
  versionId: string;
  versionNumber: number;
}
