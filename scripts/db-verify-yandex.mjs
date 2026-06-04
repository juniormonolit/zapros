import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  let url;
  for (const rawLine of envFile.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() === "DATABASE_URL") {
      url = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return url;
}

const databaseUrl = getDatabaseUrl();
const url = new URL(databaseUrl);
const client = new pg.Client({
  host: url.hostname,
  port: url.port ? Number(url.port) : 6432,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ""),
  ssl: { rejectUnauthorized: false },
});

await client.connect();
const tables = [
  "auth.users",
  "public.profiles",
  "public.suppliers",
  "public.tasks",
  "public.requests",
  "public.request_events",
];
const owners = await client.query(`
  select tablename, tableowner
  from pg_tables
  where schemaname = 'public'
    and tablename in ('suppliers', 'requests', 'profiles', 'tasks')
  order by tablename
`);
console.log("table owners:", owners.rows);

const rls = await client.query(`
  select c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('suppliers', 'requests')
`);
console.log("RLS flags:", rls.rows);

for (const t of tables) {
  const { rows } = await client.query(`select count(*)::int as c from ${t}`);
  console.log(`${t}: ${rows[0].c}`);
}

const sample = await client.query(`
  select id, name from public.suppliers limit 3
`);
console.log("suppliers sample:", sample.rows);
await client.end();
