import type { UserRole } from "@/lib/auth";

/** Admin supplier org pages: admin and senior_procurement (Option A — no procurement). */
export function canAccessSupplierOrgAdmin(role: UserRole): boolean {
  return role === "admin" || role === "senior_procurement";
}

/** Full CRUD on org master-data except hard delete (admin-only in actions). */
export function canWriteSupplierOrg(role: UserRole): boolean {
  return canAccessSupplierOrgAdmin(role);
}

export function canDeleteSupplierOrg(role: UserRole): boolean {
  return role === "admin";
}
