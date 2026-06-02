import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Application roles, mirrored from the `public.user_role` enum in the database.
 */
export type UserRole =
  | "admin"
  | "procurement"
  | "supplier"
  | "senior_procurement";

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

/**
 * Columns selected whenever a profile is loaded. Kept in one place so the
 * `select` string and the `Profile` type cannot drift apart.
 */
export const PROFILE_COLUMNS = "id, role, full_name, supplier_id, is_active";

/**
 * Maps each role to the route segment it owns. Used both for the post-login
 * landing route and for role-based access control in the middleware.
 */
const HOME_ROUTE_BY_ROLE: Record<UserRole, string> = {
  admin: "/admin",
  procurement: "/app",
  supplier: "/supplier",
  senior_procurement: "/sourcing",
};

/**
 * Returns the home route for a role (admin → `/admin`, procurement → `/app`,
 * supplier → `/supplier`, senior_procurement → `/sourcing`).
 */
export function homeRouteForRole(role: UserRole): string {
  return HOME_ROUTE_BY_ROLE[role];
}

/**
 * Returns the currently authenticated user (verified against the Supabase auth
 * server), or `null` when there is no valid session.
 *
 * Server-only: relies on the cookie-bound server client, so it must not be
 * called from the middleware (use the request-bound client there instead).
 */
export async function getUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

/**
 * Loads the `profiles` row for the current user. Returns `null` when the user
 * is unauthenticated or the profile cannot be read (e.g. RLS denies access).
 *
 * Server-only, for the same reasons as {@link getUser}.
 */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return null;
  }

  return data as Profile;
}
