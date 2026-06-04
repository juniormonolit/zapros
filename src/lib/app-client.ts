import "server-only";

import { createDataClient, type DataClient } from "@/lib/db/client";
import { getSessionFromCookies } from "@/lib/auth/session.server";

export type AppDbClient = DataClient;

/**
 * Server data client scoped to the current session user (RLS via jwt.claim.sub).
 */
export async function createClient(): Promise<AppDbClient> {
  const session = await getSessionFromCookies();
  return createDataClient(session?.userId);
}
