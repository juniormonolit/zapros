import "server-only";

import pg from "pg";

import { getDatabaseUrl, parseDatabaseUrl } from "@/lib/db/config";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      ...parseDatabaseUrl(getDatabaseUrl()),
      max: 20,
      connectionTimeoutMillis: 30_000,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
    });
  }
  return pool;
}
