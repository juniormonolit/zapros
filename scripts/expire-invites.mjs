// Cron runner: expire overdue supplier invites (F007 / WIN-007).
//
// Usage:
//   npm run cron:expire-invites
//
// Requires DATABASE_URL (.env.production, .env.local, or process.env).

import process from "node:process";

import { getDatabaseUrl } from "./db-connect.mjs";

const databaseUrl = getDatabaseUrl();
if (!databaseUrl) {
  console.error(
    "Error: DATABASE_URL is not set (.env.production, .env.local, or process.env).",
  );
  process.exit(1);
}

process.env.DATABASE_URL = databaseUrl;

const { createAdminClient } = await import("../src/lib/admin-client.ts");
const { runExpireInvites } = await import("../src/lib/expire-invites.ts");

async function main() {
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
