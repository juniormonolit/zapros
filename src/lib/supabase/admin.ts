import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getServerEnv, publicEnv } from "@/lib/env";

/**
 * Creates a privileged Supabase admin client backed by the service role key.
 *
 * This client bypasses Row Level Security and must NEVER be used in client
 * code or exposed to the browser. The `server-only` import above causes a build
 * error if this module is ever imported into a client bundle.
 *
 * Use exclusively in trusted server contexts (Server Actions, cron jobs,
 * invite flows). Auth persistence is disabled because this client is not tied
 * to a user session.
 */
export function createAdminClient() {
  const { supabaseServiceRoleKey } = getServerEnv();

  return createSupabaseClient(publicEnv.supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
