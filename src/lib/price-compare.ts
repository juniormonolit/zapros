/**
 * Pure price comparison for supplier response line items (F004).
 *
 * Suppliers may quote up to three price variants per line. For sorting and
 * "best price" highlighting we normalize cash to non-cash equivalent and take
 * the minimum among filled variants:
 *
 *   non_cash_equiv(cash) = price_cash / cash_to_noncash_ratio
 *   comparable = min(price_without_vat, price_with_vat, non_cash_equiv(cash))
 *
 * The ratio defaults to {@link DEFAULT_CASH_TO_NONCASH_RATIO} (0.84) and is
 * typically loaded from `app_settings.cash_to_noncash_ratio`. Everything here is
 * pure — no DB, no network.
 */

/** Default cash→non-cash coefficient (`app_settings.cash_to_noncash_ratio`). */
export const DEFAULT_CASH_TO_NONCASH_RATIO = 0.84;

/** Maximum allowed ratio (matches admin settings validation: (0, 1]). */
export const MAX_CASH_TO_NONCASH_RATIO = 1;

/** Nullable price fields on a response line item snapshot. */
export interface LinePrices {
  price_with_vat?: number | null;
  price_cash?: number | null;
  price_without_vat?: number | null;
}

function isFilledPrice(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

function safeRatio(ratio: number): number {
  return Number.isFinite(ratio) && ratio > 0 && ratio <= MAX_CASH_TO_NONCASH_RATIO
    ? ratio
    : DEFAULT_CASH_TO_NONCASH_RATIO;
}

/**
 * Convert a cash (нал) unit price to non-cash equivalent for comparison.
 *
 * @param cash Cash price per unit.
 * @param ratio `cash_to_noncash_ratio` (default {@link DEFAULT_CASH_TO_NONCASH_RATIO}).
 */
export function normalizeCashToNonCash(
  cash: number,
  ratio: number = DEFAULT_CASH_TO_NONCASH_RATIO,
): number {
  return cash / safeRatio(ratio);
}

/**
 * Lowest comparable unit price among filled variants on a line.
 *
 * Cash is normalized via {@link normalizeCashToNonCash}. Returns `null` when no
 * price field is filled.
 */
export function comparableUnitPrice(
  prices: LinePrices,
  ratio: number = DEFAULT_CASH_TO_NONCASH_RATIO,
): number | null {
  const r = safeRatio(ratio);
  const candidates: number[] = [];

  if (isFilledPrice(prices.price_without_vat)) {
    candidates.push(prices.price_without_vat);
  }
  if (isFilledPrice(prices.price_with_vat)) {
    candidates.push(prices.price_with_vat);
  }
  if (isFilledPrice(prices.price_cash)) {
    candidates.push(normalizeCashToNonCash(prices.price_cash, r));
  }

  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

/**
 * Index of the supplier with the lowest comparable price on a line.
 *
 * Ignores `null` / non-finite entries. On a tie, returns the **first** minimum
 * (lowest index).
 */
export function findBestSupplierIndex(
  pricesPerSupplier: (number | null)[],
): number | null {
  let bestIndex: number | null = null;
  let bestPrice: number | null = null;

  for (let i = 0; i < pricesPerSupplier.length; i++) {
    const price = pricesPerSupplier[i];
    if (price == null || !Number.isFinite(price)) continue;
    if (bestPrice === null || price < bestPrice) {
      bestPrice = price;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Parse the `cash_to_noncash_ratio` app setting (stored as key-value text).
 *
 * Accepts a decimal string like `"0.84"`. Invalid values — `null`, empty,
 * non-numeric, non-positive, or above {@link MAX_CASH_TO_NONCASH_RATIO} — fall
 * back to `fallback`.
 */
export function parseCashToNoncashRatio(
  value: string | null | undefined,
  fallback: number = DEFAULT_CASH_TO_NONCASH_RATIO,
): number {
  const safeFallback =
    Number.isFinite(fallback) &&
    fallback > 0 &&
    fallback <= MAX_CASH_TO_NONCASH_RATIO
      ? fallback
      : DEFAULT_CASH_TO_NONCASH_RATIO;

  if (value == null) return safeFallback;

  const trimmed = value.trim();
  if (!trimmed) return safeFallback;

  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return safeFallback;

  const parsed = Number.parseFloat(trimmed);
  if (
    !Number.isFinite(parsed) ||
    parsed <= 0 ||
    parsed > MAX_CASH_TO_NONCASH_RATIO
  ) {
    return safeFallback;
  }
  return parsed;
}
