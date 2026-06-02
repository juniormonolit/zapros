/**
 * Type-safe environment variable access and validation.
 *
 * Public variables are exposed to the browser bundle and are mapped from the
 * `PUBLIC_*` names in `.env.local` to `NEXT_PUBLIC_*` via `next.config.ts`.
 * Server-only variables (e.g. the service role key) must never be read in code
 * that ships to the client.
 */

/**
 * Reads a required environment variable, throwing a descriptive error when it
 * is missing or empty. This surfaces misconfiguration early instead of failing
 * later with an opaque Supabase error.
 */
function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Add it to your environment (e.g. .env.local) and restart the server.`,
    );
  }

  return value;
}

/**
 * Public Supabase configuration, safe to use in both server and browser code.
 * Backed by `NEXT_PUBLIC_*` which Next.js inlines into the client bundle.
 */
export const publicEnv = {
  supabaseUrl: requireEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: requireEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
} as const;

/**
 * Server-only Supabase configuration. Reading this from client code will throw
 * because the underlying variable is never exposed to the browser bundle.
 */
export function getServerEnv() {
  return {
    supabaseServiceRoleKey: requireEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  } as const;
}
