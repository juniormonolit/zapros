// Cron runner: expire overdue supplier invites (F007 / WIN-007).
//
// Usage:
//   npm run cron:expire-invites
//
// Reads SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL from the
// environment, falling back to .env.local (same manual parse as apply-migration).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

import { runExpireInvites } from "../src/lib/expire-invites.ts";

/**
 * Loads a single env var from process.env or .env.local.
 */
function getEnv(name) {
  if (process.env[name]) {
    return process.env[name];
  }

  /** @type {Record<string, string[]>} */
  const aliases = {
    NEXT_PUBLIC_SUPABASE_URL: ["PUBLIC_SUPABASE_URL"],
  };

  try {
    const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    const parsed = {};
    for (const rawLine of envFile.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      parsed[key] = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    }

    if (parsed[name]) {
      return parsed[name];
    }

    for (const alias of aliases[name] ?? []) {
      if (parsed[alias]) {
        return parsed[alias];
      }
    }
  } catch {
    // .env.local missing — fail below with a clear message.
  }

  return undefined;
}

function requireEnv(name) {
  const value = getEnv(name);
  if (!value || value.trim() === "") {
    console.error(`Error: ${name} is not set (checked process.env and .env.local).`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const now = new Date();
  const result = await runExpireInvites(admin, now);

  console.log(
    `Expire invites: ${result.expiredInviteCount} invite(s), ${result.updatedRequestCount} request(s).`,
  );

  if (result.errors.length > 0) {
    console.error("Errors:", result.errors.join("; "));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
