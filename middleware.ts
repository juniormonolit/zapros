import { NextResponse, type NextRequest } from "next/server";

import { getSessionFromRequest } from "@/lib/auth/session-edge";

const LOGIN_ROUTE = "/login";
const AUTH_REDIRECT_ROUTE = "/auth/redirect";

function matchedProtected(pathname: string): boolean {
  return ["/admin", "/app", "/supplier", "/sourcing"].some(
    (segment) => pathname === segment || pathname.startsWith(`${segment}/`),
  );
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

/**
 * Edge middleware: session cookie check + coarse auth gate.
 * Role checks run in Node layouts (`getProfile`) and `/auth/redirect`.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(request);
  const { pathname } = request.nextUrl;

  const isProtected = matchedProtected(pathname);
  const isLogin = pathname === LOGIN_ROUTE;
  const isRoot = pathname === "/";

  if (!session) {
    if (isProtected || isRoot) {
      return redirectTo(request, LOGIN_ROUTE);
    }
    return NextResponse.next();
  }

  if (pathname === AUTH_REDIRECT_ROUTE) {
    return NextResponse.next();
  }

  if (isLogin || isRoot) {
    return redirectTo(request, AUTH_REDIRECT_ROUTE);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
