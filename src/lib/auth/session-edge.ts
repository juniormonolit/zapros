import type { NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/jwt";

/** Edge middleware: read session from request cookies. */
export async function getSessionFromRequest(
  request: NextRequest,
): Promise<{ userId: string; email: string } | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  return { userId: claims.sub, email: claims.email };
}
