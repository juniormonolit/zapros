import "server-only";

import { cookies } from "next/headers";

import { cache } from "react";

import { loadProfileById } from "@/lib/auth/profiles.server";
import { getSessionFromCookies } from "@/lib/auth/session.server";
import {
  VIEW_AS_COOKIE,
  isAdminViewAsEnabled,
  resolveEffectiveDbUserId,
} from "@/lib/view-as-policy";

export {
  VIEW_AS_COOKIE,
  isAdminViewAsEnabled,
  resolveEffectiveDbUserId,
} from "@/lib/view-as-policy";

export const VIEW_AS_MAX_AGE_SEC = 8 * 60 * 60;

export const VIEW_AS_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: VIEW_AS_MAX_AGE_SEC,
} as const;

export async function clearViewAsCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({
    name: VIEW_AS_COOKIE,
    path: VIEW_AS_COOKIE_OPTIONS.path,
  });
}

export async function getSessionUserId(): Promise<string | undefined> {
  const session = await getSessionFromCookies();
  return session?.userId;
}

export async function getViewAsUserIdFromCookies(): Promise<string | null> {
  if (!isAdminViewAsEnabled()) return null;

  const cookieStore = await cookies();
  const value = cookieStore.get(VIEW_AS_COOKIE)?.value?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * User id used for RLS via `createClient` / `withDbSession`.
 * Admin with view-as cookie → impersonated id when flag on and target active.
 */
export const getEffectiveDbUserId = cache(
  async (): Promise<string | undefined> => {
    const session = await getSessionFromCookies();
    if (!session) return undefined;

    const viewAsEnabled = isAdminViewAsEnabled();
    const viewAsUserId = await getViewAsUserIdFromCookies();

    const sessionProfile = await loadProfileById(session.userId);
    const sessionRole = sessionProfile?.role ?? null;

    let viewAsTargetActive = false;
    if (viewAsUserId) {
      const target = await loadProfileById(viewAsUserId);
      viewAsTargetActive = target?.is_active === true;
    }

    return resolveEffectiveDbUserId({
      sessionUserId: session.userId,
      sessionRole,
      viewAsUserId,
      viewAsEnabled,
      viewAsTargetActive,
    });
  },
);
