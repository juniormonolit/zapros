// Set or reset password for an existing auth.users row (native auth).
//
// Usage:
//   node scripts/set-user-password.mjs <email> <new-password>
//
// Use when create-admin says "admin already exists" but login fails
// (empty encrypted_password or old password from another environment).

import process from "node:process";

import bcrypt from "bcryptjs";

import { createPgClient, getDatabaseUrl } from "./db-connect.mjs";

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error(
      "Error: DATABASE_URL is required (.env.production, .env.local, or process.env).",
    );
    process.exit(1);
  }

  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const password = process.argv[3] ?? "";

  if (!email || !password) {
    console.error(
      "Usage: node scripts/set-user-password.mjs <email> <new-password>",
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Error: password must be at least 8 characters.");
    process.exit(1);
  }

  const client = createPgClient(databaseUrl);
  await client.connect();

  try {
    const { rows: users } = await client.query(
      `select id, email, encrypted_password is not null as has_password
       from auth.users where lower(email) = lower($1)`,
      [email],
    );

    if (users.length === 0) {
      console.error(`Error: no auth.users row for email ${email}.`);
      console.error("Create the user first (create-admin or admin UI).");
      process.exit(1);
    }

    const encrypted = await bcrypt.hash(password, 12);
    const { rowCount } = await client.query(
      `update auth.users set encrypted_password = $1 where lower(email) = lower($2)`,
      [encrypted, email],
    );

    if (!rowCount) {
      console.error("Error: password was not updated.");
      process.exit(1);
    }

    const { rows: profile } = await client.query(
      `
      select p.id, p.role, p.is_active
      from public.profiles p
      join auth.users u on u.id = p.id
      where lower(u.email) = lower($1)
      `,
      [email],
    );

    console.log(`Password updated for ${email}.`);
    if (profile[0]) {
      console.log(`  profile id:   ${profile[0].id}`);
      console.log(`  role:         ${profile[0].role}`);
      console.log(`  is_active:    ${profile[0].is_active}`);
    } else {
      console.log(
        "  Warning: no matching profiles row — login may still fail until profile exists.",
      );
    }
    console.log("Log in with this email and the new password you just set.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
