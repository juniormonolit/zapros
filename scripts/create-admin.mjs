// Bootstrap the first admin user.
//
// Usage:
//   node scripts/create-admin.mjs <email> <password>
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/create-admin.mjs
//
// Reads PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment,
// falling back to a manual parse of .env.local (same approach as
// apply-migration.mjs). Secrets are NEVER hardcoded and never logged.
//
// Respects the `one_admin` partial unique index: if an admin already exists the
// script reports it and exits 0 instead of failing.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

/**
 * Parses .env.local into a plain object. Values may be quoted; a single pair of
 * surrounding quotes is stripped. Returns {} when the file is absent.
 */
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
      const value = line
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      env[key] = value;
    }
  } catch {
    // Missing .env.local is fine; we validate required values below.
  }
  return env;
}

/** Reads a value from process.env first, then the parsed .env.local. */
function readValue(fileEnv, name) {
  return process.env[name] ?? fileEnv[name];
}

async function main() {
  const fileEnv = loadEnvFile();

  const supabaseUrl = readValue(fileEnv, "PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readValue(fileEnv, "SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required " +
        "(checked process.env and .env.local).",
    );
    process.exit(1);
  }

  const email = (process.argv[2] ?? readValue(fileEnv, "ADMIN_EMAIL") ?? "")
    .trim()
    .toLowerCase();
  const password = process.argv[3] ?? readValue(fileEnv, "ADMIN_PASSWORD") ?? "";

  if (!email || !password) {
    console.error(
      "Error: admin email and password are required.\n" +
        "Usage: node scripts/create-admin.mjs <email> <password>\n" +
        "   or: ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/create-admin.mjs",
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Refuse to create a second admin (the DB index would reject it anyway).
  const { count, error: countError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if (countError) {
    console.error("Error: could not query existing admins:", countError.message);
    process.exit(1);
  }

  if ((count ?? 0) > 0) {
    console.log(
      "An admin already exists (one_admin constraint). Nothing to do.",
    );
    process.exit(0);
  }

  // 2. Create the auth user with a confirmed email so it can log in at once.
  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    console.error(
      "Error: could not create auth user:",
      createError?.message ?? "unknown error",
    );
    process.exit(1);
  }

  const userId = created.user.id;

  // 3. Promote the trigger-created profile to admin (upsert is idempotent).
  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      role: "admin",
      full_name: "Administrator",
      is_active: true,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    // Clean up the orphaned auth user so the script can be retried.
    await supabase.auth.admin.deleteUser(userId);

    if (profileError.code === "23505") {
      console.log(
        "An admin already exists (one_admin constraint). Rolled back the new auth user.",
      );
      process.exit(0);
    }
    console.error("Error: could not set admin profile:", profileError.message);
    process.exit(1);
  }

  // 4. Verify end-to-end and report (without logging the password).
  const { data: profile, error: verifyError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .single();

  if (verifyError || !profile) {
    console.error(
      "Warning: admin created but verification read failed:",
      verifyError?.message ?? "no profile returned",
    );
    process.exit(1);
  }

  console.log("First admin created successfully.");
  console.log(`  email:      ${email}`);
  console.log(`  user id:    ${profile.id}`);
  console.log(`  role:       ${profile.role}`);
  console.log(`  is_active:  ${profile.is_active}`);
  console.log("Log in with the email and the password you supplied.");
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
