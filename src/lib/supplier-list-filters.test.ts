import { describe, expect, it } from "vitest";

import {
  filtersFromSearchParams,
  toSupplierListFilters,
} from "@/lib/supplier-list-filters";

describe("filtersFromSearchParams", () => {
  it("maps string query params to filter values", () => {
    expect(
      filtersFromSearchParams({
        kind: "dealer",
        priority: "favorite",
        category: "cat-1",
        brand: "brand-1",
        region: "Москва",
        active: "true",
        q: "металл",
      }),
    ).toEqual({
      kind: "dealer",
      priority: "favorite",
      category: "cat-1",
      brand: "brand-1",
      region: "Москва",
      active: "true",
      q: "металл",
    });
  });

  it("ignores array params and returns empty strings", () => {
    expect(filtersFromSearchParams({ kind: ["dealer", "mixed"] })).toEqual({
      kind: "",
      priority: "",
      category: "",
      brand: "",
      region: "",
      active: "",
      q: "",
    });
  });
});

describe("toSupplierListFilters", () => {
  it("parses valid enums and booleans", () => {
    expect(
      toSupplierListFilters({
        kind: "carrier",
        priority: "verified",
        category: "  uuid-cat  ",
        brand: "uuid-brand",
        region: " СПб ",
        active: "false",
        q: "  search  ",
      }),
    ).toEqual({
      supplierKind: "carrier",
      wavePriority: "verified",
      categoryId: "uuid-cat",
      brandId: "uuid-brand",
      region: "СПб",
      isActive: false,
      search: "search",
    });
  });

  it("drops invalid kind/priority and treats empty active as null", () => {
    expect(
      toSupplierListFilters({
        kind: "invalid",
        priority: "",
        category: "",
        brand: "",
        region: "",
        active: "maybe",
        q: "",
      }),
    ).toEqual({
      supplierKind: null,
      wavePriority: null,
      categoryId: null,
      brandId: null,
      region: null,
      isActive: null,
      search: null,
    });
  });
});
