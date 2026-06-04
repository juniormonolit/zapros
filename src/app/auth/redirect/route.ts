import { NextResponse } from "next/server";

import { getProfile, homeRouteForRole } from "@/lib/auth";

/**
 * Post-login redirect target (Node runtime). Middleware cannot use `pg`, so
 * authenticated users hitting `/` or `/login` are sent here to resolve role.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const profile = await getProfile();

  if (!profile || !profile.is_active) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  return NextResponse.redirect(new URL(homeRouteForRole(profile.role), origin));
}
