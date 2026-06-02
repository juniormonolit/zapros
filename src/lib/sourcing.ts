/**
 * Supplier sourcing funnel — the single place that defines the funnel stages,
 * their Russian labels, and the rule that derives `works_in_zapros` from the
 * stage. Shared by the server actions and the admin UI so the enum values and
 * the synchronization rule can never drift apart.
 *
 * Mirrors the `supplier_sourcing_status` enum from migration 006.
 */

export const SOURCING_STATUSES = [
  "new",
  "called",
  "clarified",
  "got_price",
  "test_order",
  "approved",
  "working_in_zapros",
  "rejected",
] as const;

export type SourcingStatus = (typeof SOURCING_STATUSES)[number];

/** Stage that means the supplier is actively working in Zapros. */
export const WORKING_IN_ZAPROS_STATUS: SourcingStatus = "working_in_zapros";

/** Default stage for a freshly created supplier (matches the DB default). */
export const DEFAULT_SOURCING_STATUS: SourcingStatus = "new";

/** Russian labels for each funnel stage, shown across the admin UI. */
export const SOURCING_STATUS_LABELS: Record<SourcingStatus, string> = {
  new: "Новый",
  called: "Прозвонил",
  clarified: "Уточнил",
  got_price: "Получил прайс",
  test_order: "Тестовая заявка",
  approved: "Можно работать",
  working_in_zapros: "Работает в Zapros",
  rejected: "Не сработались",
};

/** Type guard: is the given string a valid funnel stage? */
export function isSourcingStatus(value: string): value is SourcingStatus {
  return (SOURCING_STATUSES as readonly string[]).includes(value);
}

/**
 * Single source of truth for the `works_in_zapros` flag: it is `true` exactly
 * when the supplier is at the `working_in_zapros` stage. Always derive the flag
 * from the stage; never let the two be set independently.
 */
export function deriveWorksInZapros(status: SourcingStatus): boolean {
  return status === WORKING_IN_ZAPROS_STATUS;
}
