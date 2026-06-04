/**
 * Type-safe environment variable access and validation.
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

/** Server-only configuration. Never import from client components. */
export function getServerEnv() {
  return {
    authSecret: requireEnv("AUTH_SECRET", process.env.AUTH_SECRET),
    databaseUrl: requireEnv("DATABASE_URL", process.env.DATABASE_URL),
  } as const;
}
