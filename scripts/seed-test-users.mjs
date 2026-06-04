// Seed demo users for local/staging (all roles except admin).
//
// Usage:
//   node scripts/seed-test-users.mjs
//
// Requires DATABASE_URL. Idempotent: skips emails that already exist.

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import bcrypt from "bcryptjs";

import { createPgClient, getDatabaseUrl } from "./db-connect.mjs";

const TEST_PASSWORD = "ZaprosParty3!";
const EMAIL_DOMAIN = "demo.zapros.test";

const PROCUREMENT_USERS = [
  { slug: "snab-kot", fullName: "Снабжён Котёнок" },
  { slug: "zakup-zayka", fullName: "Закупайка Зайка" },
  { slug: "gvozd-otboga", fullName: "Гвоздь От Бога" },
];

const SENIOR_USERS = [
  { slug: "star-bumazhnik", fullName: "Старший Бумажник" },
  { slug: "shef-zayavok", fullName: "Шеф Заявок" },
  { slug: "vladyka-price", fullName: "Владыка Прайса" },
];

const SUPPLIER_USERS = [
  {
    slug: "yozhik-dealer",
    fullName: "Поставщик Ёжик",
    companyName: 'ООО «Ёжики и Гвозди»',
  },
  {
    slug: "bobr-opt",
    fullName: "Бобёр Сделок",
    companyName: 'ООО «Бобры оптом»',
  },
  {
    slug: "wen-sanya",
    fullName: "Уен Саня",
    companyName: 'ООО «Уен Трейд»',
  },
];

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
    // optional
  }
  return env;
}

function readValue(fileEnv, name) {
  return process.env[name] ?? fileEnv[name];
}

function emailFor(slug) {
  return `${slug}@${EMAIL_DOMAIN}`.toLowerCase();
}

async function listAuthEmails(client) {
  const { rows } = await client.query(
    `select lower(email) as email from auth.users where email is not null`,
  );
  return new Set(rows.map((r) => r.email));
}

async function ensureSupplierCompany(client, name) {
  const { rows: existing } = await client.query(
    `select id from public.suppliers where name = $1 limit 1`,
    [name],
  );
  if (existing[0]) return existing[0].id;

  const { rows: created } = await client.query(
    `
    insert into public.suppliers (name, is_active, sourcing_status, works_in_zapros)
    values ($1, true, 'working_in_zapros', true)
    returning id
    `,
    [name],
  );
  return created[0].id;
}

async function createUser(client, params) {
  const { email, password, role, fullName, supplierId } = params;
  const id = randomUUID();
  const encrypted = await bcrypt.hash(password, 12);

  await client.query("BEGIN");
  try {
    await client.query(
      `insert into auth.users (id, email, encrypted_password) values ($1, $2, $3)`,
      [id, email, encrypted],
    );
    await client.query(
      `
      insert into public.profiles (id, role, full_name, is_active, supplier_id)
      values ($1, $2, $3, true, $4)
      on conflict (id) do update
      set role = excluded.role,
          full_name = excluded.full_name,
          supplier_id = excluded.supplier_id,
          is_active = true
      `,
      [id, role, fullName, supplierId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }

  return id;
}

function renderMarkdown(rows) {
  const lines = [
    "# Тестовые пользователи (demo)",
    "",
    "Сгенерировано скриптом `scripts/seed-test-users.mjs`.",
    "",
    `**Пароль:** \`${TEST_PASSWORD}\``,
    "",
    "## Снабженцы (procurement)",
    "",
    "| Имя | Email |",
    "|-----|-------|",
  ];

  for (const row of rows.filter((r) => r.role === "procurement")) {
    lines.push(`| ${row.fullName} | ${row.email} |`);
  }

  lines.push("", "## Старшие снабженцы (senior_procurement)", "", "| Имя | Email |", "|-----|-------|");
  for (const row of rows.filter((r) => r.role === "senior_procurement")) {
    lines.push(`| ${row.fullName} | ${row.email} |`);
  }

  lines.push("", "## Поставщики (supplier)", "", "| Имя | Компания | Email |", "|-----|----------|-------|");
  for (const row of rows.filter((r) => r.role === "supplier")) {
    lines.push(`| ${row.fullName} | ${row.companyName ?? "—"} | ${row.email} |`);
  }

  lines.push("", "## Вход", "", "- URL: `/login`", "");
  return lines.join("\n");
}

async function main() {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    console.error("Error: DATABASE_URL is required.");
    process.exit(1);
  }

  const client = createPgClient(databaseUrl);
  await client.connect();

  try {
    const existingEmails = await listAuthEmails(client);
    const report = [];

    for (const user of PROCUREMENT_USERS) {
      const email = emailFor(user.slug);
      if (existingEmails.has(email)) {
        report.push({ role: "procurement", ...user, email, status: "skipped (exists)" });
        continue;
      }
      await createUser(client, {
        email,
        password: TEST_PASSWORD,
        role: "procurement",
        fullName: user.fullName,
      });
      report.push({ role: "procurement", ...user, email, status: "created" });
    }

    for (const user of SENIOR_USERS) {
      const email = emailFor(user.slug);
      if (existingEmails.has(email)) {
        report.push({
          role: "senior_procurement",
          ...user,
          email,
          status: "skipped (exists)",
        });
        continue;
      }
      await createUser(client, {
        email,
        password: TEST_PASSWORD,
        role: "senior_procurement",
        fullName: user.fullName,
      });
      report.push({
        role: "senior_procurement",
        ...user,
        email,
        status: "created",
      });
    }

    for (const user of SUPPLIER_USERS) {
      const email = emailFor(user.slug);
      const supplierId = await ensureSupplierCompany(client, user.companyName);
      if (existingEmails.has(email)) {
        report.push({
          role: "supplier",
          fullName: user.fullName,
          companyName: user.companyName,
          email,
          status: "skipped (exists)",
        });
        continue;
      }
      await createUser(client, {
        email,
        password: TEST_PASSWORD,
        role: "supplier",
        fullName: user.fullName,
        supplierId,
      });
      report.push({
        role: "supplier",
        fullName: user.fullName,
        companyName: user.companyName,
        email,
        status: "created",
      });
    }

    const docPath = resolve(process.cwd(), "ai_docs/develop/test-users.md");
    writeFileSync(docPath, renderMarkdown(report), "utf8");

    console.log("Test users seed complete.\n");
    console.log(`Password (all): ${TEST_PASSWORD}\n`);
    for (const row of report) {
      const extra = row.companyName ? ` · ${row.companyName}` : "";
      console.log(`[${row.status}] ${row.role}: ${row.fullName}${extra}`);
      console.log(`         ${row.email}`);
    }
    console.log(`\nSaved: ai_docs/develop/test-users.md`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
