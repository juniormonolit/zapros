/**
 * One-time copy of application data: Supabase (public + auth.users) -> Yandex zapros.
 *
 * Prerequisites:
 *   - All SQL migrations 000-016 applied on Yandex (npm run db:migrate).
 *   - .env.local:
 *       DATABASE_URL          -> Yandex zapros (zapros_migrate)
 *       SUPABASE_DATABASE_URL -> Supabase direct/session pooler (postgres user)
 *
 * Usage:
 *   node scripts/migrate-data-supabase-to-yandex.mjs
 *   node scripts/migrate-data-supabase-to-yandex.mjs --dry-run
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const dryRun = process.argv.includes("--dry-run");

/** Tables in FK-safe order (parents before children). */
const TABLE_ORDER = [
  "app_settings",
  "suppliers",
  "supplier_groups",
  "supplier_group_members",
  "bitrix_group_settings",
  "profiles",
  "tasks",
  "task_items",
  "requests",
  "request_items",
  "request_suppliers",
  "supplier_response_versions",
  "response_line_items",
  "request_events",
  "notifications",
];

function loadEnvFile() {
  const vars = {};
  try {
    const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of envFile.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      vars[key] = line
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // ignore
  }
  return vars;
}

function requireUrl(name, value) {
  if (!value?.trim()) {
    console.error(
      `Error: ${name} is missing. Add it to .env.local (see script header).`,
    );
    process.exit(1);
  }
  return value.trim();
}

function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  const ssl =
    url.hostname.includes("yandexcloud.net") ||
    url.hostname.includes("supabase.com");
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "") || "postgres",
    ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

function quoteIdent(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

async function listPublicTables(client) {
  const { rows } = await client.query(`
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename
  `);
  return new Set(rows.map((r) => r.tablename));
}

async function countRows(client, qualifiedName) {
  const { rows } = await client.query(`select count(*)::int as c from ${qualifiedName}`);
  return rows[0].c;
}

async function copyAuthUsers(source, target) {
  const { rows } = await source.query(`
    select id, email, created_at
    from auth.users
    order by created_at
  `);
  console.log(`auth.users: ${rows.length} row(s) on source`);

  if (dryRun || rows.length === 0) return;

  for (const row of rows) {
    await target.query(
      `
      insert into auth.users (id, email, created_at)
      values ($1, $2, $3)
      on conflict (id) do update
      set email = excluded.email
      `,
      [row.id, row.email, row.created_at],
    );
  }
}

async function truncateTargetTables(target, tables, targetTables) {
  const ordered = [...tables].reverse().filter((t) => targetTables.has(t));
  if (ordered.length === 0) return;

  const list = ordered.map((t) => `public.${quoteIdent(t)}`).join(", ");
  console.log(`Truncating ${ordered.length} public table(s) on target (single CASCADE)...`);
  await target.query(`truncate table ${list} restart identity cascade`);
}

async function copyTable(source, target, table, targetTables, options) {
  if (!targetTables.has(table)) {
    console.log(`  ${table}: skip (not in target schema)`);
    return;
  }

  const qualified = `public.${quoteIdent(table)}`;
  const sourceCount = await countRows(source, qualified);

  if (sourceCount === 0) {
    console.log(`  ${table}: skip (empty on source)`);
    return;
  }

  const targetCount = await countRows(target, qualified);
  console.log(`  ${table}: source=${sourceCount}, target=${targetCount}`);

  if (dryRun) return;

  const { rows } = await source.query(`select * from ${qualified}`);
  const columns = Object.keys(rows[0]);
  const colList = columns.map(quoteIdent).join(", ");

  if (!options.skipTruncate) {
    await target.query(`truncate ${qualified}`);
  }

  const batchSize = 200;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders = batch
      .map(
        (_, rowIndex) =>
          `(${columns
            .map(
              (_, colIndex) =>
                `$${rowIndex * columns.length + colIndex + 1}`,
            )
            .join(", ")})`,
      )
      .join(", ");
    const values = batch.flatMap((row) => columns.map((c) => row[c]));
    await target.query(
      `insert into ${qualified} (${colList}) values ${placeholders}`,
      values,
    );
  }

  const after = await countRows(target, qualified);
  console.log(`  ${table}: copied -> ${after} row(s) on target`);
}

async function main() {
  const fileEnv = loadEnvFile();
  const yandexUrl = requireUrl(
    "DATABASE_URL",
    process.env.DATABASE_URL ?? fileEnv.DATABASE_URL,
  );
  const supabaseUrl = requireUrl(
    "SUPABASE_DATABASE_URL",
    process.env.SUPABASE_DATABASE_URL ?? fileEnv.SUPABASE_DATABASE_URL,
  );

  const source = new Client(parseDatabaseUrl(supabaseUrl));
  const target = new Client(parseDatabaseUrl(yandexUrl));

  console.log(dryRun ? "DRY RUN — no writes" : "Copying Supabase -> Yandex");
  console.log(`Source host: ${parseDatabaseUrl(supabaseUrl).host}`);
  console.log(`Target host: ${parseDatabaseUrl(yandexUrl).host}`);

  await source.connect();
  await target.connect();

  try {
    if (!dryRun) {
      await target.query("BEGIN");
      // Bypass FK/trigger checks while loading a consistent snapshot.
      await target.query("SET session_replication_role = replica");
    }

    console.log("\n1/2 auth.users");
    await copyAuthUsers(source, target);

    const sourceTables = await listPublicTables(source);
    const targetTables = await listPublicTables(target);
    const ordered = [
      ...TABLE_ORDER.filter((t) => sourceTables.has(t)),
      ...[...sourceTables].filter((t) => !TABLE_ORDER.includes(t)),
    ];

    console.log("\n2/2 public tables");
    if (!dryRun) {
      await truncateTargetTables(target, ordered, targetTables);
    }
    for (const table of ordered) {
      await copyTable(source, target, table, targetTables, { skipTruncate: true });
    }

    if (!dryRun) {
      await target.query("SET session_replication_role = DEFAULT");
      await target.query("COMMIT");
      console.log("\nDone. Data committed on Yandex.");
    } else {
      console.log("\nDry run finished.");
    }
  } catch (err) {
    if (!dryRun) {
      try {
        await target.query("ROLLBACK");
      } catch {
        // ignore
      }
    }
    console.error("\nMigration failed.");
    console.error(`${err.code ? `[${err.code}] ` : ""}${err.message}`);
    process.exitCode = 1;
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
