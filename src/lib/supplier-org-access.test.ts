import { describe, expect, it } from "vitest";

import type { UserRole } from "@/lib/auth";
import {
  canAccessSupplierOrgAdmin,
  canDeleteSupplierOrg,
  canWriteSupplierOrg,
} from "@/lib/supplier-org-access";

const ALL_ROLES: UserRole[] = [
  "admin",
  "senior_procurement",
  "procurement",
  "supplier",
];

describe("canAccessSupplierOrgAdmin (Option A)", () => {
  it.each([
    ["admin", true],
    ["senior_procurement", true],
    ["procurement", false],
    ["supplier", false],
  ] as const)("returns %s for role %s", (role, expected) => {
    expect(canAccessSupplierOrgAdmin(role)).toBe(expected);
  });

  it("covers every UserRole", () => {
    for (const role of ALL_ROLES) {
      expect(typeof canAccessSupplierOrgAdmin(role)).toBe("boolean");
    }
  });
});

describe("canWriteSupplierOrg", () => {
  it("matches admin page access (no procurement write)", () => {
    for (const role of ALL_ROLES) {
      expect(canWriteSupplierOrg(role)).toBe(canAccessSupplierOrgAdmin(role));
    }
  });
});

describe("canDeleteSupplierOrg", () => {
  it.each([
    ["admin", true],
    ["senior_procurement", false],
    ["procurement", false],
    ["supplier", false],
  ] as const)("returns %s for role %s", (role, expected) => {
    expect(canDeleteSupplierOrg(role)).toBe(expected);
  });
});
