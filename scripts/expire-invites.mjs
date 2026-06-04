// Cron runner: expire overdue supplier invites (F007 / WIN-007).
//
// Usage:
//   npm run cron:expire-invites
//
// Requires DATABASE_URL (.env.local or process.env).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { createAdminClient } from "../src/lib/admin-client.ts";
import { runExpireInvites } from "../src/lib/expire-invites.ts";

function getEnv(name) {
  if (process.env[name]) {
    return process.env[name];
  }

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
    return parsed[name];
  } catch {
    return undefined;
  }
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
  requireEnv("DATABASE_URL");

  const admin = createAdminClient();
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
