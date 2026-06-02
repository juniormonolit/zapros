import { NextResponse, type NextRequest } from "next/server";

import {
  homeRouteForRole,
  PROFILE_COLUMNS,
  type UserRole,
} from "@/lib/auth";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Protected route segments and the role each one requires. A path belongs to a
 * segment when it equals the segment or is nested beneath it.
 */
const SEGMENT_ROLE: Record<string, UserRole> = {
  "/admin": "admin",
  "/app": "procurement",
  "/supplier": "supplier",
  "/sourcing": "senior_procurement",
};

const LOGIN_ROUTE = "/login";

/**
 * Returns the protected segment a pathname belongs to, or `null` when the path
 * is not under any protected segment.
 */
function matchedSegment(pathname: string): string | null {
  return (
    Object.keys(SEGMENT_ROLE).find(
      (segment) =>
        pathname === segment || pathname.startsWith(`${segment}/`),
    ) ?? null
  );
}

/**
 * Builds a redirect to `pathname`, copying the (possibly refreshed) auth
 * cookies from `response` so the session is not lost across the redirect.
 */
function redirectTo(
  request: NextRequest,
  pathname: string,
  response: NextResponse,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }

  return redirect;
}

/**
 * Redirects to the login page while clearing the Supabase auth cookies, so a
 * deactivated or profile-less user cannot keep a usable session.
 */
function redirectToLoginAndClear(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const redirect = redirectTo(request, LOGIN_ROUTE, response);
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      redirect.cookies.delete(cookie.name);
    }
  }

  return redirect;
}

/**
 * Edge middleware: refreshes the auth session, gates protected routes, and
 * enforces per-segment role access.
 *
 * Routing rules:
 * - Unauthenticated users hitting `/` or a protected segment → `/login`.
 * - Authenticated users on `/login` or `/` → their role's home route.
 * - Authenticated users on a segment they don't own → their own home route.
 * - Deactivated / profile-less users → logged out and sent to `/login`.
 *
 * The profile role is read with the request-bound client from `updateSession`
 * (the server `cookies()` API is unavailable here).
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { supabase, user, response } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const segment = matchedSegment(pathname);
  const isProtected = segment !== null;
  const isLogin = pathname === LOGIN_ROUTE;
  const isRoot = pathname === "/";

  if (!user) {
    if (isProtected || isRoot) {
      return redirectTo(request, LOGIN_ROUTE, response);
    }

    return response;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    return redirectToLoginAndClear(request, response);
  }

  const home = homeRouteForRole(profile.role as UserRole);

  if (isLogin || isRoot) {
    return redirectTo(request, home, response);
  }

  if (segment && SEGMENT_ROLE[segment] !== profile.role) {
    return redirectTo(request, home, response);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on all routes except Next.js internals and static asset files, so we
     * never refresh the session for `_next/*`, the favicon, or image files.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
