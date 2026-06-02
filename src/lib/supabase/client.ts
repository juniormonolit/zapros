import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * Creates a Supabase client for use in Client Components.
 *
 * Relies on the public env (URL + anon key) which is safe to expose to the
 * browser. Each call returns a fresh client; `@supabase/ssr` handles cookie
 * synchronization with the server clients.
 */
export function createClient() {
  return createBrowserClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
  );
}
