import pg from "pg";

import { createPgClient, getDatabaseUrl } from "./db-connect.mjs";

const databaseUrl = getDatabaseUrl();
if (!databaseUrl) {
  console.error(
    "Error: DATABASE_URL is not set (.env.production, .env.local, or process.env).",
  );
  process.exit(1);
}

const client = createPgClient(databaseUrl);

await client.connect();
const tables = [
  "auth.users",
  "public.profiles",
  "public.suppliers",
  "public.tasks",
  "public.requests",
  "public.request_events",
];

const { rows: owners } = await client.query(`
  select tablename, tableowner
  from pg_tables
  where schemaname = 'public'
    and tablename in ('profiles', 'requests', 'suppliers', 'tasks')
  order by tablename
`);
console.log("table owners:", owners);

const { rows: rls } = await client.query(`
  select relname, relrowsecurity, relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and relname in ('requests', 'suppliers')
`);
console.log("RLS flags:", rls);

for (const table of tables) {
  const { rows } = await client.query(`select count(*)::int as n from ${table}`);
  console.log(`${table}:`, rows[0].n);
}

const { rows: suppliers } = await client.query(
  `select id, name from public.suppliers order by name limit 3`,
);
console.log("suppliers sample:", suppliers);

await client.end();
