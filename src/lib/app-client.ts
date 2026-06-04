import "server-only";

import { createDataClient, type DataClient } from "@/lib/db/client";
import { getEffectiveDbUserId } from "@/lib/view-as";

export type AppDbClient = DataClient;

/**
 * Server data client scoped to the effective user (session or admin view-as).
 * RLS uses `jwt.claim.sub` = {@link getEffectiveDbUserId}.
 */
export async function createClient(): Promise<AppDbClient> {
  const userId = await getEffectiveDbUserId();
  return createDataClient(userId);
}
