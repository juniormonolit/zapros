import { describe, expect, it } from "vitest";

import {
  DEFAULT_CASH_TO_NONCASH_RATIO,
  comparableUnitPrice,
  findBestSupplierIndex,
  normalizeCashToNonCash,
  parseCashToNoncashRatio,
} from "@/lib/price-compare";

/**
 * Tests for F004 price normalization and best-supplier selection.
 *
 * Formula: min(without_vat, with_vat, cash / ratio). Default ratio 0.84.
 * Tie-breaking for findBestSupplierIndex: first minimum index wins.
 */

const RATIO = DEFAULT_CASH_TO_NONCASH_RATIO;

describe("normalizeCashToNonCash", () => {
  it("divides cash by the ratio (default 0.84)", () => {
    expect(normalizeCashToNonCash(840)).toBeCloseTo(1000, 10);
    expect(normalizeCashToNonCash(840, RATIO)).toBeCloseTo(1000, 10);
  });

  it("uses a custom ratio when provided", () => {
    expect(normalizeCashToNonCash(500, 0.5)).toBe(1000);
  });
});

describe("comparableUnitPrice — single variant", () => {
  it("returns only cash normalized to non-cash equivalent", () => {
    expect(comparableUnitPrice({ price_cash: 840 })).toBeCloseTo(1000, 10);
  });

  it("returns only price_with_vat as-is", () => {
    expect(comparableUnitPrice({ price_with_vat: 950 })).toBe(950);
  });

  it("returns only price_without_vat as-is", () => {
    expect(comparableUnitPrice({ price_without_vat: 800 })).toBe(800);
  });
});

describe("comparableUnitPrice — mix and min", () => {
  it("picks the minimum among all filled variants", () => {
    expect(
      comparableUnitPrice({
        price_without_vat: 900,
        price_with_vat: 1100,
        price_cash: 756, // 756 / 0.84 = 900
      }),
    ).toBe(900);
  });

  it("prefers a lower non-cash price over normalized cash", () => {
    expect(
      comparableUnitPrice({
        price_without_vat: 700,
        price_cash: 840, // 1000 normalized
      }),
    ).toBe(700);
  });
});

describe("comparableUnitPrice — ratio edge cases", () => {
  it("uses a smaller ratio to inflate cash equivalent (higher comparable)", () => {
    const prices = { price_cash: 400, price_with_vat: 500 };
    expect(comparableUnitPrice(prices, 0.5)).toBe(500);
    expect(comparableUnitPrice(prices, 1)).toBe(400);
  });

  it("falls back to default ratio when ratio is invalid", () => {
    expect(comparableUnitPrice({ price_cash: 840 }, 0)).toBeCloseTo(1000, 10);
    expect(comparableUnitPrice({ price_cash: 840 }, Number.NaN)).toBeCloseTo(
      1000,
      10,
    );
  });
});

describe("comparableUnitPrice — empty / invalid", () => {
  it("returns null when no price fields are filled", () => {
    expect(comparableUnitPrice({})).toBeNull();
    expect(
      comparableUnitPrice({
        price_cash: null,
        price_with_vat: undefined,
        price_without_vat: null,
      }),
    ).toBeNull();
  });

  it("ignores non-finite and negative values", () => {
    expect(
      comparableUnitPrice({
        price_with_vat: Number.NaN,
        price_cash: -10,
        price_without_vat: 100,
      }),
    ).toBe(100);
  });

  it("treats zero as a valid filled price", () => {
    expect(comparableUnitPrice({ price_without_vat: 0 })).toBe(0);
  });
});

describe("findBestSupplierIndex", () => {
  it("returns the index of the minimum non-null price", () => {
    expect(findBestSupplierIndex([1200, 900, 1000])).toBe(1);
  });

  it("returns null when all entries are null", () => {
    expect(findBestSupplierIndex([null, null])).toBeNull();
  });

  it("skips nulls and picks among remaining", () => {
    expect(findBestSupplierIndex([null, 500, 600])).toBe(1);
  });

  it("on a tie returns the first minimum index", () => {
    expect(findBestSupplierIndex([900, 800, 800, 1200])).toBe(1);
  });
});

describe("parseCashToNoncashRatio", () => {
  it("parses a valid decimal string", () => {
    expect(parseCashToNoncashRatio("0.84")).toBe(0.84);
    expect(parseCashToNoncashRatio("1")).toBe(1);
    expect(parseCashToNoncashRatio("  0.5  ")).toBe(0.5);
    expect(parseCashToNoncashRatio(".75")).toBe(0.75);
  });

  it("falls back to 0.84 for null / undefined / empty", () => {
    expect(parseCashToNoncashRatio(null)).toBe(0.84);
    expect(parseCashToNoncashRatio(undefined)).toBe(0.84);
    expect(parseCashToNoncashRatio("")).toBe(0.84);
    expect(parseCashToNoncashRatio("   ")).toBe(0.84);
  });

  it("falls back to 0.84 for non-numeric or out-of-range values", () => {
    expect(parseCashToNoncashRatio("garbage")).toBe(0.84);
    expect(parseCashToNoncashRatio("0")).toBe(0.84);
    expect(parseCashToNoncashRatio("-0.5")).toBe(0.84);
    expect(parseCashToNoncashRatio("1.01")).toBe(0.84);
    expect(parseCashToNoncashRatio("1e-2")).toBe(0.84);
  });

  it("honors a custom valid fallback", () => {
    expect(parseCashToNoncashRatio("nope", 0.9)).toBe(0.9);
    expect(parseCashToNoncashRatio(null, 0.5)).toBe(0.5);
  });

  it("sanitizes an invalid custom fallback back to the default", () => {
    expect(parseCashToNoncashRatio("nope", 0)).toBe(0.84);
    expect(parseCashToNoncashRatio("nope", 2)).toBe(0.84);
    expect(parseCashToNoncashRatio("nope", Number.NaN)).toBe(0.84);
  });
});
