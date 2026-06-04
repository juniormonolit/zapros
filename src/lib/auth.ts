import { cache } from "react";

import { loadProfileById } from "@/lib/auth/profiles.server";
import type { Profile, UserRole } from "@/lib/auth/profile-types";
export type { Profile, UserRole } from "@/lib/auth/profile-types";
export { PROFILE_COLUMNS } from "@/lib/auth/profile-types";
import { getSessionFromCookies } from "@/lib/auth/session.server";
import { findUserById } from "@/lib/auth/users.server";
import { getEffectiveDbUserId } from "@/lib/view-as";

/** Authenticated user (session + auth.users). */
export interface AppUser {
  id: string;
  email: string;
}

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

/** Profile for the logged-in session user (not view-as impersonation). */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const session = await getSessionFromCookies();
  if (!session) return null;
  return loadProfileById(session.userId);
});

/** Profile for the effective DB user (view-as when active, else session). */
export const getEffectiveProfile = cache(
  async (): Promise<Profile | null> => {
    const effectiveId = await getEffectiveDbUserId();
    if (!effectiveId) return null;
    return loadProfileById(effectiveId);
  },
);
