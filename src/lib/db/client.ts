import "server-only";

import { fromTable, type QueryBuilder } from "@/lib/db/postgrest";

export type { DbResult } from "@/lib/db/types";

export type DataClient = {
  from: (table: string) => QueryBuilder;
};

/** Drop-in type alias for migrated libs (was `SupabaseClient`). */
export type DbClient = DataClient;

/**
 * Postgres data access with optional user context for RLS (`auth.uid()`).
 * Omit `userId` for admin/server paths (table owner bypasses RLS on Yandex).
 */
export function createDataClient(userId?: string): DataClient {
  return {
    from(table: string) {
      return fromTable(userId, table);
    },
  };
}
