import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";

/**
 * Result of {@link updateSession}: the request-bound Supabase client, the
 * authenticated user (or `null`), and the response carrying any refreshed auth
 * cookies. The caller must base every redirect on `response` so that the
 * rotated cookies are not dropped.
 */
export interface SessionContext {
  supabase: SupabaseClient;
  user: User | null;
  response: NextResponse;
}

/**
 * Refreshes the Supabase auth session for the incoming request following the
 * official `@supabase/ssr` Next.js middleware pattern.
 *
 * Returns the request-bound client and response so the middleware can perform
 * role-based routing on the same cookie context. Do not add logic between
 * creating the client and calling `getUser()`, and always build redirects from
 * the returned `response` (copying its cookies) to keep the browser and server
 * sessions in sync.
 */
export async function updateSession(
  request: NextRequest,
): Promise<SessionContext> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT: refresh the session by calling getUser() immediately after
  // creating the client. Reading `response` afterwards yields the value the
  // closure may have reassigned during the refresh, so its rotated cookies are
  // preserved.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user, response };
}
