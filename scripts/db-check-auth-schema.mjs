import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const rawLine of envFile.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() === "DATABASE_URL") {
      return line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return undefined;
}

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

const databaseUrl = getDatabaseUrl();
if (!databaseUrl) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const client = new pg.Client({
  ...parseDatabaseUrl(databaseUrl),
  ssl: { rejectUnauthorized: false },
});

await client.connect();
const checks = await Promise.all([
  client.query(`
    select nspname, nspowner::regrole::text as owner
    from pg_namespace
    where nspname in ('auth', 'public')
    order by nspname
  `),
  client.query(`select current_user, session_user`),
  client.query(`
    select datname, pg_catalog.pg_get_userbyid(datdba) as owner
    from pg_database
    where datname = current_database()
  `),
  client.query(`
    select tablename
    from pg_tables
    where schemaname = 'auth' and tablename = 'users'
  `),
  client.query(`
    select p.proname, pg_get_userbyid(p.proowner) as owner
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  `),
  client.query(`select datname from pg_database where datname = 'zapros'`),
]);
console.log("schemas:", checks[0].rows);
console.log("session:", checks[1].rows);
console.log("database:", checks[2].rows);
console.log("auth.users:", checks[3].rows);
console.log("auth.uid():", checks[4].rows);
console.log("zapros db:", checks[5].rows);
await client.end();
