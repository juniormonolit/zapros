import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILES = [".env.production", ".env.local"];

function parseEnvFile(filename: string): Record<string, string> {
  const vars: Record<string, string> = {};
  try {
    const envFile = readFileSync(resolve(process.cwd(), filename), "utf8");
    for (const rawLine of envFile.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
      if (key === "DATABASE_URL") {
        const corrupt = value.match(/^(.*\?sslmode=require)([A-Z_]+=.*)$/);
        if (corrupt) {
          value = corrupt[1];
          vars[corrupt[2].slice(0, corrupt[2].indexOf("="))] = corrupt[2]
            .slice(corrupt[2].indexOf("=") + 1)
            .trim();
        }
      }
      vars[key] = value;
    }
  } catch {
    // optional file
  }
  return vars;
}

function loadEnvFile(): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const file of ENV_FILES) {
    Object.assign(merged, parseEnvFile(file));
  }
  return merged;
}

function sanitizeDatabaseUrl(url: string): string {
  const trimmed = url.trim();
  const corrupt = trimmed.match(/^(.*\?sslmode=require)([A-Z_]+=.*)$/);
  return corrupt ? corrupt[1] : trimmed;
}

/** Server-only Postgres URL (Yandex Managed PostgreSQL). */
export function getDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv?.trim()) return sanitizeDatabaseUrl(fromEnv);

  const fileEnv = loadEnvFile();
  if (fileEnv.DATABASE_URL) return sanitizeDatabaseUrl(fileEnv.DATABASE_URL);

  throw new Error(
    'Missing DATABASE_URL. Add it to .env.production or .env.local.',
  );
}

export function parseDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "") || "postgres",
    ssl: { rejectUnauthorized: false } as const,
  };
}
