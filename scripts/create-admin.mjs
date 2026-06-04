// Bootstrap the first admin user on Yandex Postgres (native auth).
//
// Usage:
//   node scripts/create-admin.mjs <email> <password>
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/create-admin.mjs
//
// Requires DATABASE_URL and applies migration 017 (encrypted_password) if needed.

import { randomUUID } from "node:crypto";
import process from "node:process";

import bcrypt from "bcryptjs";

import { createPgClient, getDatabaseUrl, getEnvValue } from "./db-connect.mjs";

async function main() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    console.error(
      "Error: DATABASE_URL is required (.env.production, .env.local, or process.env).",
    );
    process.exit(1);
  }

  const email = (process.argv[2] ?? getEnvValue("ADMIN_EMAIL") ?? "")
    .trim()
    .toLowerCase();
  const password = process.argv[3] ?? getEnvValue("ADMIN_PASSWORD") ?? "";

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
      console.log(
        "To reset the admin password: node scripts/set-user-password.mjs <email> <password>",
      );
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
