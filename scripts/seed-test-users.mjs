// Seed demo users for local/staging (all roles except admin).
//
// Usage:
//   node scripts/seed-test-users.mjs
//
// Creates 3 procurement, 3 senior_procurement, 3 supplier users with fun names.
// Idempotent: skips emails that already exist in auth.
// Prints credentials to stdout; does NOT log service role key.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

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

async function listAuthEmails(supabase) {
  const emails = new Set();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    for (const user of data.users) {
      if (user.email) emails.add(user.email.toLowerCase());
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return emails;
}

async function ensureSupplierCompany(supabase, name) {
  const { data: existing } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("name", name)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("suppliers")
    .insert({
      name,
      is_active: true,
      sourcing_status: "working_in_zapros",
      works_in_zapros: true,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`supplier "${name}": ${error?.message ?? "insert failed"}`);
  }
  return created.id;
}

async function createUser(supabase, params) {
  const { email, password, role, fullName, supplierId } = params;

  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    throw new Error(createError?.message ?? "auth create failed");
  }

  const userId = created.user.id;
  const profile = {
    id: userId,
    role,
    full_name: fullName,
    is_active: true,
    supplier_id: role === "supplier" ? supplierId : null,
  };

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(profile, { onConflict: "id" });

  if (profileError) {
    await supabase.auth.admin.deleteUser(userId);
    throw new Error(profileError.message);
  }

  return userId;
}

function renderMarkdown(rows) {
  const lines = [
    "# Тестовые пользователи (demo)",
    "",
    "Сгенерировано скриптом `scripts/seed-test-users.mjs`.",
    "Пароль у всех одинаковый — только для dev/staging.",
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

  lines.push("", "## Вход", "", "- URL: `/login`", "- После входа: procurement → `/app`, senior → `/sourcing`, supplier → `/supplier`", "");
  return lines.join("\n");
}

async function main() {
  const fileEnv = loadEnvFile();
  const supabaseUrl = readValue(fileEnv, "PUBLIC_SUPABASE_URL");
  const serviceRoleKey = readValue(fileEnv, "SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Error: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const existingEmails = await listAuthEmails(supabase);
  /** @type {Array<{role:string,fullName:string,email:string,companyName?:string,status:string}>} */
  const report = [];

  for (const user of PROCUREMENT_USERS) {
    const email = emailFor(user.slug);
    if (existingEmails.has(email)) {
      report.push({ role: "procurement", ...user, email, status: "skipped (exists)" });
      continue;
    }
    await createUser(supabase, {
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
    await createUser(supabase, {
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
    const supplierId = await ensureSupplierCompany(supabase, user.companyName);
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
    await createUser(supabase, {
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
}

main().catch((err) => {
  console.error("Unexpected error:", err.message);
  process.exit(1);
});
