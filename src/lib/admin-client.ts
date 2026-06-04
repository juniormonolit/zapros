import "server-only";

import { createDataClient, type DataClient } from "@/lib/db/client";

export type AdminDbClient = DataClient;

/** Postgres client without user RLS context (cron, admin mutations). */
export function createAdminClient(): AdminDbClient {
  return createDataClient();
}
