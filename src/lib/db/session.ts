import "server-only";

import type pg from "pg";

import { getPool } from "@/lib/db/pool";

/**
 * Runs `fn` in a transaction. When `userId` is set, configures `auth.uid()` for
 * RLS policies. Admin calls omit `userId` (table owner bypasses RLS on Yandex).
 */
export async function withDbSession<T>(
  userId: string | undefined,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (userId) {
      await client.query(
        `SELECT set_config('request.jwt.claim.sub', $1, true)`,
        [userId],
      );
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}
