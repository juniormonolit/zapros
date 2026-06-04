import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import pg from "pg";

/** Later files override earlier (local wins over production on dev machines). */
const ENV_FILES = [".env.production", ".env.local"];

function parseEnvFile(filename) {
  const vars = {};
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
          const secretKey = corrupt[2].slice(0, corrupt[2].indexOf("="));
          const secretVal = corrupt[2].slice(corrupt[2].indexOf("=") + 1).trim();
          vars[secretKey] = secretVal;
        }
      }
      vars[key] = value;
    }
  } catch {
    // file missing
  }
  return vars;
}

function loadEnvFromFiles() {
  const merged = {};
  for (const file of ENV_FILES) {
    Object.assign(merged, parseEnvFile(file));
  }
  return merged;
}

/** Read env var from process.env or .env.production / .env.local */
export function getEnvValue(name) {
  const fromProcess = process.env[name];
  if (fromProcess?.trim()) return fromProcess.trim();
  const merged = loadEnvFromFiles();
  return merged[name]?.trim() || undefined;
}

export function getDatabaseUrl() {
  return getEnvValue("DATABASE_URL");
}

export function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "") || "postgres",
    ssl: { rejectUnauthorized: false },
  };
}

export function createPgClient(databaseUrl) {
  return new pg.Client(parseDatabaseUrl(databaseUrl));
}
