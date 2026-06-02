// Reusable migration runner.
//
// Usage:
//   node scripts/apply-migration.mjs supabase/migrations/001_enums_profiles.sql
//
// Reads DATABASE_URL from the environment. If it is not already set, it is
// loaded from .env.local (simple manual parse, no extra dependency). The
// connection string / password is NEVER hardcoded here and is never logged.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

/**
 * Loads DATABASE_URL from process.env, falling back to a manual parse of
 * .env.local. Returns the connection string without ever printing it.
 */
function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  try {
    const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of envFile.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (key === "DATABASE_URL") {
        // Value may be quoted; strip a single pair of surrounding quotes.
        return line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    // .env.local missing is fine; we just fail below with a clear message.
  }

  return undefined;
}

/**
 * Parses a postgres connection URL into discrete pg client fields. The
 * password is URL-decoded so special characters in the URL-encoded form are
 * handled correctly and never depend on pg's own string parsing.
 */
function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "") || "postgres",
  };
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
      "Error: DATABASE_URL is not set (checked process.env and .env.local).",
    );
    process.exit(1);
  }

  const sqlPath = resolve(process.cwd(), sqlPathArg);
  const sql = readFileSync(sqlPath, "utf8");

  // Build a discrete config (host/port/user/password/database) instead of
  // passing the connection string straight to pg. This decodes the password
  // ourselves so special characters (#, ?, @, etc.) cannot break parsing.
  // Supabase requires TLS; rejectUnauthorized:false avoids bundling the CA
  // chain for this internal migration tooling.
  const client = new Client({
    ...parseDatabaseUrl(databaseUrl),
    ssl: { rejectUnauthorized: false },
  });

  console.log(`Applying migration: ${sqlPathArg}`);

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
