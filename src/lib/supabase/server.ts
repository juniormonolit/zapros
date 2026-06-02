import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env";

/**
 * Creates a Supabase client for use in Server Components, Server Actions and
 * Route Handlers.
 *
 * In Next.js 15 `cookies()` is async, so this helper is async too. The cookie
 * adapter lets `@supabase/ssr` read and refresh the auth session. Writing
 * cookies from a Server Component throws; we swallow that case because session
 * refresh is handled by the middleware helper (`updateSession`).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `setAll` was called from a Server Component where mutating
            // cookies is not allowed. Safe to ignore when middleware refreshes
            // the session.
          }
        },
      },
    },
  );
}
