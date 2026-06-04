// Wipes all auth users (profiles cascade) for a fresh native-auth bootstrap.
// Usage: node scripts/reset-auth-users.mjs

import process from "node:process";

import { createPgClient, getDatabaseUrl } from "./db-connect.mjs";

async function main() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    console.error("Error: DATABASE_URL is required.");
    process.exit(1);
  }

  const client = createPgClient(databaseUrl);
  await client.connect();

  try {
    await client.query("truncate table auth.users cascade");
    const { rows } = await client.query(
      `select count(*)::int as n from auth.users`,
    );
    console.log(`auth.users cleared. Remaining: ${rows[0].n}`);
    console.log("Next: node scripts/create-admin.mjs <email> <password>");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
