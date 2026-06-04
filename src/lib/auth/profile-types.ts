/**
 * Shared profile types (no server imports) to avoid circular deps with profiles.server.
 */

export type UserRole =
  | "admin"
  | "procurement"
  | "supplier"
  | "senior_procurement";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  supplier_id: string | null;
  is_active: boolean;
}

export const PROFILE_COLUMNS =
  "id, role, full_name, supplier_id, is_active" as const;
