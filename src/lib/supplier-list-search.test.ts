import { describe, expect, it } from "vitest";

import {
  brandNamesMatchSearch,
  buildSupplierSearchOrFilter,
  escapeIlikePattern,
  normalizeSearchTerm,
  supplierMatchesSearch,
  supplierRowMatchesSearch,
} from "@/lib/supplier-list-search";

describe("escapeIlikePattern", () => {
  it("escapes ilike metacharacters", () => {
    expect(escapeIlikePattern("100%_done\\")).toBe("100\\%\\_done\\\\");
  });
});

describe("normalizeSearchTerm", () => {
  it("returns null for empty values", () => {
    expect(normalizeSearchTerm(null)).toBeNull();
    expect(normalizeSearchTerm(undefined)).toBeNull();
    expect(normalizeSearchTerm("   ")).toBeNull();
  });

  it("trims non-empty terms", () => {
    expect(normalizeSearchTerm("  acme  ")).toBe("acme");
  });
});

describe("buildSupplierSearchOrFilter", () => {
  it("builds field ilike clauses without brand ids", () => {
    expect(buildSupplierSearchOrFilter("metal", [])).toBe(
      "name.ilike.%metal%,phone.ilike.%metal%,contact_person.ilike.%metal%",
    );
  });

  it("includes brand-matched supplier ids in or filter", () => {
    expect(
      buildSupplierSearchOrFilter("vel", ["uuid-a", "uuid-b"]),
    ).toBe(
      "name.ilike.%vel%,phone.ilike.%vel%,contact_person.ilike.%vel%,id.in.(uuid-a,uuid-b)",
    );
  });

  it("escapes special characters in search term", () => {
    expect(buildSupplierSearchOrFilter("50%", [])).toBe(
      "name.ilike.%50\\%%,phone.ilike.%50\\%%,contact_person.ilike.%50\\%%",
    );
  });
});

describe("supplierRowMatchesSearch", () => {
  const row = {
    name: "ООО Металл",
    phone: "+7 900 111-22-33",
    contact_person: "Иван Петров",
  };

  it("matches name", () => {
    expect(supplierRowMatchesSearch(row, "металл")).toBe(true);
  });

  it("matches phone", () => {
    expect(supplierRowMatchesSearch(row, "900 111")).toBe(true);
  });

  it("matches contact person", () => {
    expect(supplierRowMatchesSearch(row, "петров")).toBe(true);
  });

  it("returns false when no field matches", () => {
    expect(supplierRowMatchesSearch(row, "бетон")).toBe(false);
  });
});

describe("brandNamesMatchSearch", () => {
  it("matches brand name substring", () => {
    expect(brandNamesMatchSearch(["Velux", "Knauf"], "vel")).toBe(true);
  });

  it("returns false when no brand matches", () => {
    expect(brandNamesMatchSearch(["Knauf"], "vel")).toBe(false);
  });
});

describe("supplierMatchesSearch", () => {
  const row = {
    name: "ООО Строй",
    phone: null,
    contact_person: null,
  };

  it("matches via supplier fields", () => {
    expect(supplierMatchesSearch(row, "строй", [])).toBe(true);
  });

  it("matches via brand names when fields do not match", () => {
    expect(supplierMatchesSearch(row, "velux", ["Velux Premium"])).toBe(true);
  });

  it("returns false when neither fields nor brands match", () => {
    expect(supplierMatchesSearch(row, "бетон", ["Knauf"])).toBe(false);
  });
});
