// Bootstrap the first admin user on Yandex Postgres (native auth).
//
// Usage:
//   node scripts/create-admin.mjs <email> <password>
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/create-admin.mjs
//
// Requires DATABASE_URL and applies migration 017 (encrypted_password) if needed.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import bcrypt from "bcryptjs";

import { createPgClient, getDatabaseUrl } from "./db-connect.mjs";

function loadEnvFile() {
  const env = {};
  try {
    const file = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const rawLine of file.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      env[key] = line
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // optional
  }
  return env;
}

function readValue(fileEnv, name) {
  return process.env[name] ?? fileEnv[name];
}

async function main() {
  const fileEnv = loadEnvFile();
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    console.error("Error: DATABASE_URL is required (.env.local or process.env).");
    process.exit(1);
  }

  const email = (process.argv[2] ?? readValue(fileEnv, "ADMIN_EMAIL") ?? "")
    .trim()
    .toLowerCase();
  const password = process.argv[3] ?? readValue(fileEnv, "ADMIN_PASSWORD") ?? "";

  if (!email || !password) {
    console.error(
      "Error: admin email and password are required.\n" +
        "Usage: node scripts/create-admin.mjs <email> <password>",
    );
    process.exit(1);
  }

  const client = createPgClient(databaseUrl);
  await client.connect();

  try {
    const { rows: admins } = await client.query(
      `select id from public.profiles where role = 'admin' limit 1`,
    );
    if (admins.length > 0) {
      console.log("An admin already exists (one_admin constraint). Nothing to do.");
      return;
    }

    const id = randomUUID();
    const encrypted = await bcrypt.hash(password, 12);

    await client.query("BEGIN");
    try {
      await client.query(
        `
        insert into auth.users (id, email, encrypted_password)
        values ($1, $2, $3)
        `,
        [id, email, encrypted],
      );

      await client.query(
        `
        insert into public.profiles (id, role, full_name, is_active)
        values ($1, 'admin', 'Administrator', true)
        on conflict (id) do update
        set role = 'admin', full_name = 'Administrator', is_active = true
        `,
        [id],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    const { rows: profile } = await client.query(
      `select id, role, is_active from public.profiles where id = $1`,
      [id],
    );

    if (!profile[0]) {
      console.error("Warning: admin created but verification read failed.");
      process.exit(1);
    }

    console.log("First admin created successfully.");
    console.log(`  email:      ${email}`);
    console.log(`  user id:    ${profile[0].id}`);
    console.log(`  role:       ${profile[0].role}`);
    console.log(`  is_active:  ${profile[0].is_active}`);
    console.log("Log in with the email and password you supplied.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
