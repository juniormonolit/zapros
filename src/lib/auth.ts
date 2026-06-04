import { ensureRow } from "@/lib/db/types";
import { createClient } from "@/lib/app-client";
import { getSessionFromCookies } from "@/lib/auth/session.server";
import { findUserById } from "@/lib/auth/users.server";

/**
 * Application roles, mirrored from the `public.user_role` enum in the database.
 */
export type UserRole =
  | "admin"
  | "procurement"
  | "supplier"
  | "senior_procurement";

/** Authenticated user (session + auth.users). */
export interface AppUser {
  id: string;
  email: string;
}

/**
 * The subset of the `public.profiles` row the application reads for auth and
 * routing decisions.
 */
export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  supplier_id: string | null;
  is_active: boolean;
}

export const PROFILE_COLUMNS = "id, role, full_name, supplier_id, is_active";

const HOME_ROUTE_BY_ROLE: Record<UserRole, string> = {
  admin: "/admin",
  procurement: "/app",
  supplier: "/supplier",
  senior_procurement: "/sourcing",
};

export function homeRouteForRole(role: UserRole): string {
  return HOME_ROUTE_BY_ROLE[role];
}

export async function getUser(): Promise<AppUser | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const row = await findUserById(session.userId);
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
  };
}

export async function getProfile(): Promise<Profile | null> {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", session.userId)
    .single();

  if (error) return null;

  const row = ensureRow(data);
  if (!row) return null;

  return row as unknown as Profile;
}
