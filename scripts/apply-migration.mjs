// Reusable migration runner.
//
// Usage:
//   node scripts/apply-migration.mjs supabase/migrations/001_enums_profiles.sql
//
// Reads DATABASE_URL from the environment. If it is not already set, it is
// loaded from .env.production / .env.local if not in process.env. The
// connection string / password is NEVER hardcoded here and is never logged.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import pg from "pg";

import { getDatabaseUrl, parseDatabaseUrl } from "./db-connect.mjs";

const { Client } = pg;

/** Yandex MPG cannot CREATE ROLE authenticated/anon; RLS uses PUBLIC + auth.uid() checks. */
function isYandexTarget(databaseUrl) {
  if (process.env.DB_PLATFORM === "yandex") return true;
  return databaseUrl.includes("yandexcloud.net");
}

function adaptSqlForYandex(sql) {
  return sql.replace(/\bto authenticated\b/gi, "to public");
}

async function main() {
  const sqlPathArg = process.argv[2];
  if (!sqlPathArg) {
    console.error("Error: path to .sql file is required.");
    console.error("Usage: node scripts/apply-migration.mjs <path-to-sql>");
    process.exit(1);
  }

  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error(
      "Error: DATABASE_URL is not set (checked process.env, .env.production, .env.local).",
    );
    process.exit(1);
  }

  const sqlPath = resolve(process.cwd(), sqlPathArg);
  let sql = readFileSync(sqlPath, "utf8");
  const yandex = isYandexTarget(databaseUrl);
  if (yandex) {
    sql = adaptSqlForYandex(sql);
  }

  // Build a discrete config (host/port/user/password/database) instead of
  // passing the connection string straight to pg. This decodes the password
  // ourselves so special characters (#, ?, @, etc.) cannot break parsing.
  // Supabase requires TLS; rejectUnauthorized:false avoids bundling the CA
  // chain for this internal migration tooling.
  const client = new Client({
    ...parseDatabaseUrl(databaseUrl),
    ssl: { rejectUnauthorized: false },
  });

  console.log(
    `Applying migration: ${sqlPathArg}${yandex ? " (Yandex: to authenticated → to public)" : ""}`,
  );

  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Migration applied successfully (committed).");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Ignore rollback errors; surface the original failure below.
    }
    console.error("Migration failed, transaction rolled back.");
    console.error(`${err.code ? `[${err.code}] ` : ""}${err.message}`);
    if (err.position) console.error(`At SQL position: ${err.position}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
